import { NS, Player, Server } from "@ns";
import { UltrahackerTaskState, ULTRAHACKER_TASK_ID, UserCommunicationRequest } from "../public/info";
import { BaseSpawnerTask } from "../../../../../common/tasks/baseSpawnerTask";
import { Lease, RAM_EPS } from "../../../../../common/tasks/allocator";
import { GROW_SCRIPT, HACK_SCRIPT, WEAKEN_SCRIPT } from "../../../script/constants";
import {
  HACK_MINIMUM_MONEY_PCT,
  tryFindGrowWeakSplit,
  tryFindHackWeakGrowWeakSplit,
} from "../threadCalculations";
import { applyGrow, applyWeak } from "./simulationHelpers";
import { analyzeOptions } from "./analyzeOptions";
import { getPortData, HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";

// Number of milliseconds we aim to keep between consecutive batch operations
// landing. Enforced via per-script `additionalMsec`, NOT the outer loop's sleep
// (which can be much longer — see POLL_INTERVAL_MS).
const BATCH_FRAME_OFFSET_MS = 50;

// How often the main loop wakes up to reap completed batches, reconcile the
// active target, and burst-schedule new batches into freed RAM. Decoupled from
// BATCH_FRAME_OFFSET_MS — the 50 ms landing cadence is preserved by per-script
// delays, not by the tick rate.
const POLL_INTERVAL_MS = 2000;

// Catastrophe net for drain detection. Once an HWGW batch has had its hack
// op fire (gated by `firstHwgwLandingTime`), a drop of the live server below
// this fraction of `moneyMax` triggers `repairDrainedPipeline` — kill the
// in-flight batches and rebuild against current actual state (which will run
// W/GW frames to refill before resuming HWGW).
//
// Defensive sizing (HACK_MINIMUM_MONEY_PCT = 0.75, GROW_THREAD_SAFETY = 1.05)
// combined with the future-player projection should keep money at ~98% under
// normal load — this threshold is intentionally permissive so the repair only
// fires when something genuinely unexpected has happened (outside
// participation, large prediction failures, etc.) rather than as a routine
// part of the cascade.
const DRAIN_RECOVERY_THRESHOLD = 0.2;

type FramePurpose = "W" | "GW" | "HWGW";

interface BatchFrame {
  hackThreads: number;
  hackTime: number;
  growThreads: number;
  growTime: number;
  weakThreads1: number;
  weakTime1: number;
  weakThreads2: number;
  weakTime2: number;
  purpose: FramePurpose;
}

interface InflightBatch {
  lease: Lease;
  pids: number[];
}

interface PipelineState {
  hostname: string;
  minSecurity: number;
  maxMoney: number;

  // Epoch ms when this pipeline was created. Surfaced to the panel as a
  // lifecycle marker.
  startedAt: number;

  // Epoch ms when the FIRST batch of this pipeline lands its first op.
  // 0 until the first batch is scheduled; frozen thereafter.
  firstLandingTime: number;

  // Epoch ms when the MOST RECENTLY scheduled batch lands its first op.
  // Updated on every successful schedule.
  latestLandingTime: number;

  // Epoch ms when the FIRST HWGW batch of this pipeline lands its hack op.
  // 0 until an HWGW frame is scheduled. Used to gate drain detection — we
  // can't meaningfully compare "post-state at max money" against the live
  // server until an HWGW hack has actually fired, otherwise we'd loop on the
  // warm-up state right after a swap or repair (post is at max because we
  // just sized HWGW frames, but their grows haven't landed yet).
  firstHwgwLandingTime: number;

  // Mutated "post-pipeline" expected state — what we expect the server to look
  // like after all currently-in-flight batches resolve. This is the SIZING
  // input for the NEXT batch's thread counts. Advanced forward when a batch is
  // scheduled; NOT rolled back when a batch completes (the advance already
  // represents the cumulative effect of in-flight batches).
  postSecurity: number;
  postMoney: number;

  // Absolute epoch ms when the NEXT batch's FIRST op should finish. After
  // scheduling a batch of purpose P with N ops, this advances by
  // N * BATCH_FRAME_OFFSET_MS. Floored against
  // `Date.now() + firstFinishTimeFor(frame)` on each schedule attempt so a
  // long sleep between ticks can't produce negative additionalMsec values.
  nextFinishTime: number;

  inFlight: InflightBatch[];
}

class UltrahackerTask extends BaseSpawnerTask<UltrahackerTaskState> {
  private readonly hackRam: number;
  private readonly growRam: number;
  private readonly weakRam: number;

  private userTarget: string | undefined = undefined;
  private pipeline: PipelineState | undefined = undefined;

  // In-flight batches against PRIOR target(s) after a re-target. They keep
  // running so their hack/grow/weaken work is not wasted; we reap and free
  // their leases as their pids complete.
  private draining: InflightBatch[] = [];

  // Player XP samples for projecting the player's skill forward to batch
  // hack-fire time. The real `ns.hack` outcome (money stolen) is computed at
  // op-completion, not op-call, so sizing hackPercent against the player's
  // skill at *scheduling time* under-counts how much hack will steal —
  // hack effectiveness scales with `player.skills.hacking` but grow does not
  // (grow uses `player.mults.hacking_grow`), so the asymmetry compounds into
  // a slow drain. By sampling exp.hacking each tick and computing an xp/ms
  // rate, we can project the player forward by ~hackTime when sizing a
  // batch.
  // Both 0 means no sample yet — first tick after start records the baseline.
  private lastXpSample = 0;
  private lastXpSampleAt = 0;

  constructor(ns: NS) {
    super(ns, ULTRAHACKER_TASK_ID);

    this.hackRam = this.ns.getScriptRam(HACK_SCRIPT);
    this.growRam = this.ns.getScriptRam(GROW_SCRIPT);
    this.weakRam = this.ns.getScriptRam(WEAKEN_SCRIPT);
  }

  protected async run_task(): Promise<void> {
    this.cleanOrphanWorkers();

    while (true) {
      if (this.shouldShutdown) {
        this.killAndFreeAllInflight();
        return;
      }

      // 1. Consume user comms. A re-target request does NOT kill in-flight
      // batches — they drain naturally.
      const userReq = getPortData<UserCommunicationRequest>(
        this.ns,
        HACKING_SYSTEM_COMMUNICATION_PORT,
        true,
      );
      if (userReq) this.userTarget = userReq.targetServer;

      // 2. Reconcile active pipeline target.
      const player = this.ns.getPlayer();
      const tickNow = Date.now();
      // xp/ms gained since last tick. Used to project the player's skill
      // forward to a batch's hack-fire time when sizing. First tick after
      // startup (or a re-target if we ever reset samples) records the
      // baseline and uses rate=0 — predictions are no-ops until the second
      // tick supplies a delta.
      let xpRatePerMs = 0;
      if (this.lastXpSampleAt > 0) {
        const dt = tickNow - this.lastXpSampleAt;
        if (dt > 0) xpRatePerMs = (player.exp.hacking - this.lastXpSample) / dt;
      }
      this.lastXpSample = player.exp.hacking;
      this.lastXpSampleAt = tickNow;

      // User-configurable "minimum money fraction preserved per HWGW batch".
      // Falls back to the module default if the preference is unset. Read
      // once per tick; passed into both target ranking and per-batch sizing.
      const hackMinimumMoneyPct =
        this.snapshot.preferences.hackMinimumMoneyPct ?? HACK_MINIMUM_MONEY_PCT;

      const options = analyzeOptions(
        this.ns,
        player,
        this.snapshot.allServers,
        hackMinimumMoneyPct,
      );
      const desired = this.userTarget ?? options[0]?.hostname;
      if (!desired) {
        await this.ns.sleep(POLL_INTERVAL_MS);
        continue;
      }
      if (!this.pipeline || this.pipeline.hostname !== desired) {
        this.swapPipelineTo(desired);
      }

      // 3. Reap completions on both active pipeline and draining lists.
      this.reap(this.pipeline!.inFlight);
      this.reap(this.draining);

      // 3b. Drain detection: if the active pipeline thinks it's in
      // steady-state HWGW but the server has been bled below
      // DRAIN_RECOVERY_THRESHOLD, kill the in-flight HWGW batches and rebuild
      // sizing from the current actual state. Without this, every remaining
      // HWGW hack op fires against a near-empty server while grow can't keep
      // up — the rest of the cascade is wasted work.
      //
      // Skip when the user has configured an aggressive steal target
      // (`hackMinimumMoneyPct <= DRAIN_RECOVERY_THRESHOLD`). In that mode
      // the server legitimately cycles down to ~hackMinimumMoneyPct x max
      // between batches, so live money near or below the repair threshold
      // is *expected* — running repair would just churn healthy cascades.
      if (hackMinimumMoneyPct > DRAIN_RECOVERY_THRESHOLD) {
        const liveTarget = this.ns.getServer(this.pipeline!.hostname) as Server;
        if (this.isPipelineDrained(this.pipeline!, liveTarget)) {
          this.repairDrainedPipeline(liveTarget);
        }
      }

      // 4. Greedy schedule pass: place as many batches as RAM allows.
      this.scheduleAsMuchAsPossible(this.pipeline!, player, xpRatePerMs, hackMinimumMoneyPct);

      // 5. Publish state. The panel must NOT call ns.formulas / ns.getPlayer
      // itself (each NS reference inflates the panel script's static RAM
      // cost), so the ranked target list is shipped through state.
      this.patchState({
        target: this.pipeline!.hostname,
        userTarget: this.userTarget,
        targetOptions: options,
        pipelineStartedAt: this.pipeline!.startedAt,
        firstLandingTime: this.pipeline!.firstLandingTime,
        latestLandingTime: this.pipeline!.latestLandingTime,
        inFlightCount: this.pipeline!.inFlight.length,
        drainingCount: this.draining.length,
        lastTickAt: Date.now(),
      });

      await this.ns.sleep(POLL_INTERVAL_MS);
    }
  }

  // Switch the active pipeline to a new target. Existing in-flight batches
  // get pushed into the drainage list (they keep running, get reaped over
  // the next ~weakTime as their pids complete). A fresh PipelineState is
  // built from current server snapshot.
  private swapPipelineTo(hostname: string): void {
    if (this.pipeline) {
      this.draining.push(...this.pipeline.inFlight);
      this.pipeline.inFlight = [];
    }
    const server = this.ns.getServer(hostname) as Server;
    this.pipeline = {
      hostname,
      minSecurity: server.minDifficulty!,
      maxMoney: server.moneyMax!,
      startedAt: Date.now(),
      firstLandingTime: 0,
      latestLandingTime: 0,
      firstHwgwLandingTime: 0,
      postSecurity: server.hackDifficulty!,
      postMoney: server.moneyAvailable!,
      nextFinishTime: Date.now(),
      inFlight: [],
    };
  }

  // True when an HWGW batch has actually fired its hack op against the live
  // server AND the live money is well below maxMoney. Gated on
  // firstHwgwLandingTime so we don't loop on the warm-up state: right after
  // a swap or repair the burst will schedule GW (refill) followed by HWGW
  // (post-state advances to max), but those HWGW frames don't land for
  // ~hackTime. Until at least one of them has fired, low live money is the
  // expected starting state — not a drain. The repair resets
  // firstHwgwLandingTime, so detection stays disarmed across the entire
  // recovery window until the new cascade's first HWGW lands.
  private isPipelineDrained(pipeline: PipelineState, liveTarget: Server): boolean {
    if (pipeline.firstHwgwLandingTime === 0) return false;
    if (Date.now() < pipeline.firstHwgwLandingTime) return false;
    const liveMoney = liveTarget.moneyAvailable ?? 0;
    return liveMoney < pipeline.maxMoney * DRAIN_RECOVERY_THRESHOLD;
  }

  // Kill every in-flight batch in the active pipeline and reset sizing state
  // from the live server. Keep `startedAt` — we're still attached to the same
  // target, just rebuilding the cascade. firstLandingTime resets to 0 so the
  // panel reflects "warming up" again.
  private repairDrainedPipeline(liveTarget: Server): void {
    if (!this.pipeline) return;
    const killed = this.pipeline.inFlight.length;
    for (const entry of this.pipeline.inFlight) {
      for (const pid of entry.pids) {
        if (this.ns.isRunning(pid)) this.ns.kill(pid);
      }
      this.allocator.return(entry.lease.leaseId);
    }
    this.log.warn(
      `Drain detected on ${this.pipeline.hostname}: $${liveTarget.moneyAvailable} / $${this.pipeline.maxMoney}. Killed ${killed} in-flight batch(es); rebuilding pipeline.`,
    );
    this.pipeline.firstLandingTime = 0;
    this.pipeline.latestLandingTime = 0;
    this.pipeline.firstHwgwLandingTime = 0;
    this.pipeline.postSecurity = liveTarget.hackDifficulty!;
    this.pipeline.postMoney = liveTarget.moneyAvailable!;
    this.pipeline.nextFinishTime = Date.now();
    this.pipeline.inFlight = [];
  }

  // For each entry in `inflight`: if every pid has exited, return its lease
  // to the allocator and remove the entry. Mutates the array in place.
  private reap(inflight: InflightBatch[]): void {
    for (let i = inflight.length - 1; i >= 0; i--) {
      const entry = inflight[i];
      const stillRunning = entry.pids.some((pid) => this.ns.isRunning(pid));
      if (!stillRunning) {
        this.allocator.return(entry.lease.leaseId);
        inflight.splice(i, 1);
      }
    }
  }

  // Shutdown path: kill every in-flight pid and free every lease.
  private killAndFreeAllInflight(): void {
    const killOne = (entry: InflightBatch) => {
      for (const pid of entry.pids) {
        if (this.ns.isRunning(pid)) this.ns.kill(pid);
      }
      this.allocator.return(entry.lease.leaseId);
    };

    if (this.pipeline) {
      for (const b of this.pipeline.inFlight) killOne(b);
      this.pipeline.inFlight = [];
    }
    for (const b of this.draining) killOne(b);
    this.draining = [];
  }

  // Burst-schedule pass: fill the allocator until either no host has enough
  // RAM for a complete batch frame, or sizing returns undefined. The
  // player snapshot is taken once at the top of the tick (run_task) and
  // passed in here — fresh enough across a single burst. `xpRatePerMs` is
  // the empirical XP-gain rate measured across the previous tick; used to
  // project the player's skill forward to each batch's hack-fire time.
  // `hackMinimumMoneyPct` (from preferences, fraction 0.0-1.0) controls the
  // per-batch steal target.
  private scheduleAsMuchAsPossible(
    pipeline: PipelineState,
    currentPlayer: Player,
    xpRatePerMs: number,
    hackMinimumMoneyPct: number,
  ): void {
    while (true) {
      const top = this.allocator.peekTopHost();
      if (!top) break;

      // Refresh current server snapshot per batch — op-duration formulas
      // read against fresh server state.
      const currentTarget = this.ns.getServer(pipeline.hostname) as Server;

      // Project the player's hacking skill forward to hack-fire time. The
      // real `ns.hack` outcome (money stolen) is computed when the operation
      // completes — i.e. ~hackTime in the future for the next batch. Because
      // hackPercent scales with `player.skills.hacking` but grow does not,
      // sizing hackThreads against the CURRENT skill under-counts how much
      // real hack will steal and causes the cascade to drain. Project xp
      // forward, recompute skill, and pass this `predictedPlayer` into
      // sizing functions that read hackPercent. Op-duration formulas still
      // use `currentPlayer` because Bitburner locks those at op-call time
      // (= now), not at op-completion.
      const projectedHackTime = this.ns.formulas.hacking.hackTime(currentTarget, currentPlayer);
      const projectedExp = currentPlayer.exp.hacking + xpRatePerMs * projectedHackTime;
      const projectedSkill = this.ns.formulas.skills.calculateSkill(
        projectedExp,
        currentPlayer.mults.hacking,
      );
      const predictedPlayer: Player = {
        ...currentPlayer,
        skills: { ...currentPlayer.skills, hacking: projectedSkill },
        exp: { ...currentPlayer.exp, hacking: projectedExp },
      };

      const frame = this.findOptimalBatchFrame(
        top.ram,
        top.cores,
        pipeline,
        currentTarget,
        currentPlayer,
        predictedPlayer,
        hackMinimumMoneyPct,
      );
      if (!frame) break;

      const ramNeeded = this.calculateBatchFrameRam(frame);
      const lease = this.allocator.leaseUpTo(ramNeeded);
      // Epsilon-tolerant compare: leaseUpTo can hand back a value a hair below
      // the request due to FP residue in the pool entry.
      if (!lease || lease.ram + RAM_EPS < ramNeeded) {
        this.log.error(
          `Computed a batch frame using allocator.peek(), but were unable to actually reserve it.`,
          frame,
        );
        if (lease) this.allocator.return(lease.leaseId);
        break;
      }

      // Floor the landing time so a stale nextFinishTime (e.g. after a 2s
      // sleep with nothing scheduled) can't make additionalMsec clamp to 0
      // and desync the schedule.
      pipeline.nextFinishTime = Math.max(
        pipeline.nextFinishTime,
        Date.now() + this.firstFinishTimeFor(frame),
      );

      const batch = this.scheduleOneBatch(frame, lease, pipeline);
      if (!batch) {
        // scheduleOneBatch's runScript() auto-frees the lease on launch
        // failure (see baseSpawnerTask.runScript). Caller must NOT
        // double-free.
        break;
      }

      pipeline.inFlight.push(batch);

      // Record landing telemetry. `pipeline.nextFinishTime` at this point is
      // THIS batch's first-op landing time (already floored above, not yet
      // advanced for the next batch).
      const thisLandingTime = pipeline.nextFinishTime;
      if (pipeline.firstLandingTime === 0) pipeline.firstLandingTime = thisLandingTime;
      pipeline.latestLandingTime = thisLandingTime;
      if (frame.purpose === "HWGW" && pipeline.firstHwgwLandingTime === 0) {
        pipeline.firstHwgwLandingTime = thisLandingTime;
      }

      this.advancePipelineState(pipeline, frame, top.cores, currentTarget, currentPlayer);
    }
  }

  // Minimum `nextFinishTime` (relative to now) so every op's additionalMsec
  // is non-negative. Each batch type's earliest operation is different:
  // W is just weak, GW is grow, HWGW is hack. Computing this per frame
  // (rather than once for the first frame in a round) is what lets mixed
  // [W, GW, HWGW] sequences survive without delays clamping to 0.
  private firstFinishTimeFor(batch: BatchFrame): number {
    switch (batch.purpose) {
      case "W":
        return batch.weakTime1 + BATCH_FRAME_OFFSET_MS;
      case "GW":
        return (
          Math.max(batch.growTime, batch.weakTime1 - BATCH_FRAME_OFFSET_MS) + BATCH_FRAME_OFFSET_MS
        );
      case "HWGW":
        return (
          Math.max(
            batch.hackTime,
            batch.weakTime1 - BATCH_FRAME_OFFSET_MS,
            batch.growTime - 2 * BATCH_FRAME_OFFSET_MS,
            batch.weakTime2 - 3 * BATCH_FRAME_OFFSET_MS,
          ) + BATCH_FRAME_OFFSET_MS
        );
    }
  }

  // Launch the scripts for a single batch. The landing-time anchor for the
  // FIRST op is `pipeline.nextFinishTime` (absolute epoch ms); subsequent ops
  // land BATCH_FRAME_OFFSET_MS apart from that anchor.
  //
  // Returns an InflightBatch on success. Returns undefined if any script
  // failed to launch — in which case any successfully-launched PIDs in this
  // batch have been killed and runScript() has already freed the lease, so
  // the caller MUST NOT call `allocator.return` on it again.
  private scheduleOneBatch(
    frame: BatchFrame,
    lease: Lease,
    pipeline: PipelineState,
  ): InflightBatch | undefined {
    const launchTime = Date.now();
    const baseFinishTime = pipeline.nextFinishTime;
    const hostname = pipeline.hostname;
    const launched: number[] = [];

    switch (frame.purpose) {
      case "W": {
        const targetWeakFinishTime = baseFinishTime;
        const weakDelay = Math.max(0, targetWeakFinishTime - frame.weakTime1 - launchTime);

        const pidWeak = this.runScript(
          WEAKEN_SCRIPT,
          lease,
          frame.weakThreads1,
          hostname,
          weakDelay,
        );
        if (!pidWeak) {
          this.log.error(`Failed to launch weak script in W batch.`, frame);
          return undefined;
        }
        launched.push(pidWeak);
        break;
      }

      case "GW": {
        const targetGrowFinishTime = baseFinishTime;
        const targetWeakFinishTime = baseFinishTime + BATCH_FRAME_OFFSET_MS;
        const growDelay = Math.max(0, targetGrowFinishTime - frame.growTime - launchTime);
        const weakDelay = Math.max(0, targetWeakFinishTime - frame.weakTime1 - launchTime);

        const pidGrow = this.runScript(GROW_SCRIPT, lease, frame.growThreads, hostname, growDelay);
        if (!pidGrow) {
          this.log.error(`Failed to launch grow script in GW batch.`, frame);
          return undefined;
        }
        launched.push(pidGrow);

        const pidWeak = this.runScript(
          WEAKEN_SCRIPT,
          lease,
          frame.weakThreads1,
          hostname,
          weakDelay,
        );
        if (!pidWeak) {
          this.log.error(
            `Failed to launch weak script in GW batch. Killing already-launched PIDs.`,
            frame,
          );
          launched.forEach((p) => this.ns.kill(p));
          return undefined;
        }
        launched.push(pidWeak);
        break;
      }

      case "HWGW": {
        const targetHackFinishTime = baseFinishTime;
        const targetWeak1FinishTime = baseFinishTime + BATCH_FRAME_OFFSET_MS;
        const targetGrowFinishTime = baseFinishTime + 2 * BATCH_FRAME_OFFSET_MS;
        const targetWeak2FinishTime = baseFinishTime + 3 * BATCH_FRAME_OFFSET_MS;

        const hackDelay = Math.max(0, targetHackFinishTime - frame.hackTime - launchTime);
        const weak1Delay = Math.max(0, targetWeak1FinishTime - frame.weakTime1 - launchTime);
        const growDelay = Math.max(0, targetGrowFinishTime - frame.growTime - launchTime);
        const weak2Delay = Math.max(0, targetWeak2FinishTime - frame.weakTime2 - launchTime);

        const pidHack = this.runScript(HACK_SCRIPT, lease, frame.hackThreads, hostname, hackDelay);
        if (!pidHack) {
          this.log.error(`Failed to launch hack script in HWGW batch.`, frame);
          return undefined;
        }
        launched.push(pidHack);

        const pidWeak1 = this.runScript(
          WEAKEN_SCRIPT,
          lease,
          frame.weakThreads1,
          hostname,
          weak1Delay,
        );
        if (!pidWeak1) {
          this.log.error(
            `Failed to launch weak1 script in HWGW batch. Killing already-launched PIDs.`,
            frame,
          );
          launched.forEach((p) => this.ns.kill(p));
          return undefined;
        }
        launched.push(pidWeak1);

        const pidGrow = this.runScript(GROW_SCRIPT, lease, frame.growThreads, hostname, growDelay);
        if (!pidGrow) {
          this.log.error(
            `Failed to launch grow script in HWGW batch. Killing already-launched PIDs.`,
            frame,
          );
          launched.forEach((p) => this.ns.kill(p));
          return undefined;
        }
        launched.push(pidGrow);

        const pidWeak2 = this.runScript(
          WEAKEN_SCRIPT,
          lease,
          frame.weakThreads2,
          hostname,
          weak2Delay,
        );
        if (!pidWeak2) {
          this.log.error(
            `Failed to launch weak2 script in HWGW batch. Killing already-launched PIDs.`,
            frame,
          );
          launched.forEach((p) => this.ns.kill(p));
          return undefined;
        }
        launched.push(pidWeak2);
        break;
      }
    }

    return { lease, pids: launched };
  }

  // Apply the frame's expected post-batch effect to pipeline.postSecurity /
  // postMoney, and advance nextFinishTime by ops * BATCH_FRAME_OFFSET_MS.
  // Called only AFTER scheduleOneBatch has successfully launched the scripts.
  private advancePipelineState(
    pipeline: PipelineState,
    frame: BatchFrame,
    hostCores: number,
    currentTarget: Server,
    currentPlayer: Player,
  ): void {
    switch (frame.purpose) {
      case "W": {
        // Apply weak's security reduction to postSecurity.
        const scratch: Server = {
          ...currentTarget,
          hackDifficulty: pipeline.postSecurity,
        };
        applyWeak(this.ns, scratch, frame.weakThreads1, hostCores);
        pipeline.postSecurity = scratch.hackDifficulty!;
        pipeline.nextFinishTime += BATCH_FRAME_OFFSET_MS;
        break;
      }
      case "GW": {
        // Apply grow's money bump; weak1 cancels grow's security bump so we
        // reset postSecurity to min.
        const scratch: Server = {
          ...currentTarget,
          hackDifficulty: pipeline.postSecurity,
          moneyAvailable: pipeline.postMoney,
        };
        applyGrow(this.ns, scratch, currentPlayer, frame.growThreads, hostCores, true);
        pipeline.postMoney = scratch.moneyAvailable!;
        pipeline.postSecurity = pipeline.minSecurity;
        pipeline.nextFinishTime += 2 * BATCH_FRAME_OFFSET_MS;
        break;
      }
      case "HWGW": {
        // Self-balancing: server returns to (minSec, maxMoney) after the batch.
        pipeline.postSecurity = pipeline.minSecurity;
        pipeline.postMoney = pipeline.maxMoney;
        pipeline.nextFinishTime += 4 * BATCH_FRAME_OFFSET_MS;
        break;
      }
    }
  }

  // Find the largest batch frame that fits in maxRam given hostCores.
  // PURE — does not mutate pipeline state. Caller invokes
  // `advancePipelineState` after a successful schedule.
  //
  // INVARIANTS:
  // - Thread counts size against `sizingTarget` (current server data
  //   overridden with the pipeline's post-state). This expresses "after all
  //   currently-in-flight batches resolve, the server will look like this —
  //   size threads for that state."
  // - **Op-duration formulas** (hackTime/growTime/weakenTime) read against
  //   `(currentTarget, currentPlayer)`. The game locks each operation's
  //   duration at *op-call time* (when ns.hack/grow/weaken is invoked, which
  //   is approximately now), so using the current snapshot here matches
  //   reality.
  // - **Outcome formulas** (hackPercent inside `tryFindHackWeakGrowWeakSplit`)
  //   read against `(sizingTarget, predictedPlayer)`. The game computes the
  //   amount of money stolen at *op-completion time* (~hackTime from now),
  //   by which point the player has earned XP from in-flight ops and their
  //   skill level is higher than `currentPlayer.skills.hacking`. Sizing
  //   hack-threads against the *predicted* level keeps the per-batch steal
  //   at the intended fraction instead of compounding into a slow drain.
  //   `predictedPlayer` is built by the caller from xpRatePerMs x hackTime.
  // - `currentPlayer` is NOT augmented with intra-batch XP either — that
  //   drift caused the original op-duration bug (the game locks durations at
  //   call time, so the player skill at op-call time is what matters).
  private findOptimalBatchFrame(
    hostMaxRam: number,
    hostCores: number,
    pipeline: PipelineState,
    currentTarget: Server,
    currentPlayer: Player,
    predictedPlayer: Player,
    hackMinimumMoneyPct: number,
  ): BatchFrame | undefined {
    const sizingTarget: Server = {
      ...currentTarget,
      hackDifficulty: pipeline.postSecurity,
      moneyAvailable: pipeline.postMoney,
    };

    const frame: BatchFrame = {
      purpose: "HWGW",
      growThreads: 0,
      growTime: 0,
      weakThreads1: 0,
      weakTime1: 0,
      weakThreads2: 0,
      weakTime2: 0,
      hackThreads: 0,
      hackTime: 0,
    };

    if (sizingTarget.hackDifficulty! > sizingTarget.minDifficulty!) {
      frame.purpose = "W";
    } else if (sizingTarget.moneyAvailable! < sizingTarget.moneyMax!) {
      frame.purpose = "GW";
    }

    switch (frame.purpose) {
      case "W": {
        const weakSecurityDecreasePerThread = this.ns.formulas.hacking.weakenEffect(1, hostCores);
        frame.weakThreads1 = Math.ceil(
          (sizingTarget.hackDifficulty! - sizingTarget.minDifficulty!) /
            weakSecurityDecreasePerThread,
        );
        const weakRamNeeded = frame.weakThreads1 * this.weakRam;
        if (weakRamNeeded > hostMaxRam) {
          frame.weakThreads1 = Math.floor(hostMaxRam / this.weakRam);
        }
        if (frame.weakThreads1 === 0) return undefined;
        frame.weakTime1 = this.ns.formulas.hacking.weakenTime(currentTarget, currentPlayer);
        break;
      }

      case "GW": {
        // GW outcome sizing — `growThreads` depends on `player.mults.hacking_grow`,
        // not `player.skills.hacking`, so `predictedPlayer` vs `currentPlayer`
        // is a no-op here. Passing `predictedPlayer` for symmetry with HWGW.
        const split = tryFindGrowWeakSplit(
          this.ns,
          hostMaxRam,
          hostCores,
          predictedPlayer,
          sizingTarget,
        );
        if (!split) return undefined;
        frame.growThreads = split.growThreads;
        frame.weakThreads1 = split.weakThreads;
        // Op-duration: locked at call time → currentPlayer.
        frame.growTime = this.ns.formulas.hacking.growTime(currentTarget, currentPlayer);
        frame.weakTime1 = this.ns.formulas.hacking.weakenTime(currentTarget, currentPlayer);
        break;
      }

      case "HWGW": {
        // HWGW outcome sizing — `hackPercent` (which gates the
        // `maxHackThreadsForSafety` calculation inside) scales with
        // `player.skills.hacking`, so passing the *projected* skill here is
        // what addresses the drain: sizing matches the steal that will
        // actually happen at op-completion time.
        const split = tryFindHackWeakGrowWeakSplit(
          this.ns,
          hostMaxRam,
          hostCores,
          predictedPlayer,
          sizingTarget,
          hackMinimumMoneyPct,
        );
        if (!split) return undefined;
        frame.hackThreads = split.hackThreads;
        frame.weakThreads1 = split.weak1Threads;
        frame.growThreads = split.growThreads;
        frame.weakThreads2 = split.weak2Threads;
        // Op-durations: locked at call time → currentPlayer.
        frame.hackTime = this.ns.formulas.hacking.hackTime(currentTarget, currentPlayer);
        frame.weakTime1 = this.ns.formulas.hacking.weakenTime(currentTarget, currentPlayer);
        frame.growTime = this.ns.formulas.hacking.growTime(currentTarget, currentPlayer);
        frame.weakTime2 = this.ns.formulas.hacking.weakenTime(currentTarget, currentPlayer);
        break;
      }
    }

    return frame;
  }

  // Kill any orphan hack/grow/weaken workers on our allocated hosts before
  // we start scheduling. Prior hacking-task sessions (or a hard dashboard
  // restart) can leave workers running on rooted servers; our allocator's
  // pool view doesn't see them, so leases sized against the pool would
  // overrun real free RAM and ns.exec would return 0 on the larger batches.
  private cleanOrphanWorkers(): void {
    const targets = new Set<string>([HACK_SCRIPT, GROW_SCRIPT, WEAKEN_SCRIPT]);
    let killed = 0;
    for (const slice of this.allocation.servers) {
      for (const proc of this.ns.ps(slice.hostname)) {
        if (targets.has(proc.filename)) {
          this.ns.kill(proc.pid);
          killed++;
        }
      }
    }
    if (killed > 0) this.log.info(`Cleaned ${killed} orphan worker(s) at startup`);
  }

  // Total RAM (GB) used by all scripts in this batch frame.
  private calculateBatchFrameRam(batch: BatchFrame): number {
    let usedRam = this.weakRam * batch.weakThreads1;
    if (batch.growThreads) usedRam += batch.growThreads * this.growRam;
    if (batch.hackThreads) usedRam += batch.hackThreads * this.hackRam;
    if (batch.weakThreads2) usedRam += batch.weakThreads2 * this.weakRam;
    return usedRam;
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new UltrahackerTask(ns).start();
}
