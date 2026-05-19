import { NS, Player, Server } from "@ns";
import {
  UltrahackerV2TaskState,
  ULTRAHACKER_V2_TASK_ID,
  UserCommunicationRequest,
  FramePurpose,
  PipelineSnapshot,
} from "./info";
import { BaseSpawnerTask } from "../../baseSpawnerTask";
import { Lease, RAM_EPS } from "../../allocator";
import { GROW_SCRIPT, HACK_SCRIPT, WEAKEN_SCRIPT } from "../../../script/constants";
import { tryFindGrowWeakSplit, tryFindHackWeakGrowWeakSplit } from "./threadCalculations";
import { applyGrow, applyWeak } from "./simulationHelpers";
import { analyzeOptions, isHackableServer } from "./analyzeOptions";
import { getPortData, HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";

// number of milliseconds between scheduled operation landings within a batch
const BATCH_FRAME_OFFSET_MS = 50;

// HWGW advances `nextScheduledFinish` by this many ms per batch — the spacing
// between consecutive batch landings in steady state. Used as the depth divisor
// for pipelines (depth = floor(weakTime / HWGW_BATCH_INTERVAL_MS)).
const HWGW_BATCH_INTERVAL_MS = 4 * BATCH_FRAME_OFFSET_MS;

// ideally, do not allow a single hack to take a machine lower than
// this % of its max money. This will not always be possible (super
// high levels, etc) but this is aspirationally the ideal amount.
export const HACK_MINIMUM_MONEY_PCT = 0.66;

// upper safety bound on a pipeline's in-flight depth, regardless of weakTime
const MAX_PIPELINE_DEPTH = 256;

// most pipelines we'll keep open simultaneously
const MAX_PIPELINES = 8;

// recent batch purposes retained per pipeline for the UI strip
const RECENT_BATCHES_KEEP = 200;

// Drift tolerances. Checked only after an HWGW batch lands — at that
// instant the real server should be back at min security / max money.
const DRIFT_SEC_TOLERANCE = 0.5;
const DRIFT_MONEY_FRACTION_TOLERANCE = 0.05;

// Main loop pacing. We wake on the soonest in-flight finish but clamp into
// this range so user requests and rank changes stay responsive.
const MIN_POLL_MS = 50;
const MAX_POLL_MS = 1000;

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

interface InFlightBatch {
  purpose: FramePurpose;
  finishEpoch: number;
  lease: Lease;
  pids: number[];
}

interface Pipeline {
  target: string;
  simServer: Server;
  inFlight: InFlightBatch[];
  // epoch ms — when the last script of the most-recently-scheduled batch lands.
  // 0 means uninitialized; the next schedule will bump it to now + firstFinishTime.
  nextScheduledFinish: number;
  // ring (oldest-first), bounded by RECENT_BATCHES_KEEP
  recentBatches: FramePurpose[];
  // when true, stop scheduling and wait for inFlight to drain, then rebase simServer
  healing: boolean;
  // when true, target is no longer in the keep-set; drain and remove
  closing: boolean;
  // set during reap when at least one HWGW batch's PIDs completed; gates drift check
  hwgwLandedThisReap: boolean;
}

class UltrahackerV2Task extends BaseSpawnerTask<UltrahackerV2TaskState> {
  private readonly hackRam: number;
  private readonly growRam: number;
  private readonly weakRam: number;

  private userTarget: string | undefined = undefined;
  private pipelines: Pipeline[] = [];

  constructor(ns: NS) {
    super(ns, ULTRAHACKER_V2_TASK_ID);

    this.hackRam = this.ns.getScriptRam(HACK_SCRIPT);
    this.growRam = this.ns.getScriptRam(GROW_SCRIPT);
    this.weakRam = this.ns.getScriptRam(WEAKEN_SCRIPT);
  }

  protected async run_task(): Promise<void> {
    while (true) {
      if (this.shouldShutdown) {
        this.tearDownAllPipelines(true);
        return;
      }

      // 1. Consume any user pin/unpin request. A new pin marks every other
      //    pipeline as closing (drain, no kill); pin-clear hands control back
      //    to auto-ranking without closing anything.
      this.handleUserRequest();

      // 2. Reap completed batches across all pipelines.
      for (const pipeline of this.pipelines) {
        this.reapPipeline(pipeline);
      }

      // 3. Drift check + heal transition.
      for (const pipeline of this.pipelines) {
        this.checkDriftAndHeal(pipeline);
      }

      // 4. Refresh target rankings.
      const player = this.ns.getPlayer();
      const ranked = analyzeOptions(this.ns, player, this.snapshot.allServers);

      // 4a. Validate the user pin against the ranked set. analyzeOptions
      // already filters for admin / non-purchased / moneyMax > 0, so anything
      // not present is unhackable. Log and clear rather than loop on a target
      // we can never open a pipeline for.
      if (this.userTarget && !ranked.some((r) => r.hostname === this.userTarget)) {
        this.log.warn(
          `[ultrahacker] pinned target ${this.userTarget} is not in ranked options; clearing pin`,
        );
        this.userTarget = undefined;
      }

      // 5. Reconcile open pipelines with the keep-set (user pin + top-N ranked).
      this.reconcilePipelines(ranked);

      // 6. Fill each pipeline up to its current maxDepth, in priority order.
      //    Filling pipeline 0 first naturally gives the primary target the
      //    largest hosts via the allocator's host ordering.
      for (const pipeline of this.pipelines) {
        if (pipeline.healing || pipeline.closing) continue;
        const maxDepth = this.pipelineMaxDepth(pipeline, player);
        while (pipeline.inFlight.length < maxDepth) {
          if (!this.tryScheduleOne(pipeline)) break;
        }
      }

      // 7. Open new pipelines for un-targeted top-ranked options if RAM remains.
      this.openAdditionalPipelinesIfRoom(ranked);

      // 8. Patch UI state.
      this.patchState({
        targetOptions: ranked,
        userTarget: this.userTarget,
        pipelines: this.pipelines.map((p) => this.snapshotPipeline(p, player)),
      });

      // 9. Sleep until the soonest in-flight batch finishes — that's the next
      //    time we'd have capacity to refill.
      const sleepMs = this.computeSleepMs();
      await this.ns.asleep(sleepMs);
    }
  }

  // ---------------------------------------------------------------------
  // Lifecycle / reconciliation
  // ---------------------------------------------------------------------

  private handleUserRequest(): void {
    const req = getPortData<UserCommunicationRequest>(
      this.ns,
      HACKING_SYSTEM_COMMUNICATION_PORT,
      true,
    );
    if (!req) return;
    const newTarget = req.targetServer;

    // A new pin (a defined target distinct from the prior pin) means
    // "concentrate on this one" — drain every other pipeline. Pin-clear
    // (undefined) returns control to auto-ranking and must NOT close
    // anything.
    if (newTarget !== undefined && newTarget !== this.userTarget) {
      for (const p of this.pipelines) {
        if (p.target !== newTarget) p.closing = true;
      }
    }
    this.userTarget = newTarget;
  }

  // The keep-set is: userTarget (if any) + top-N ranked. Anything else gets
  // marked closing and drained. Anything in keep-set that isn't open yet stays
  // pending — it'll get opened by openAdditionalPipelinesIfRoom.
  private reconcilePipelines(ranked: ReturnType<typeof analyzeOptions>): void {
    const keep = new Set<string>();
    if (this.userTarget) keep.add(this.userTarget);
    for (let i = 0; i < Math.min(ranked.length, MAX_PIPELINES); i++) {
      keep.add(ranked[i].hostname);
    }

    for (const pipeline of this.pipelines) {
      if (!keep.has(pipeline.target)) pipeline.closing = true;
    }

    // Drop drained closing pipelines.
    this.pipelines = this.pipelines.filter((p) => !(p.closing && p.inFlight.length === 0));

    // Reorder: user-pinned target first, then by ranked profit order.
    const rankIndex = new Map<string, number>();
    ranked.forEach((r, i) => rankIndex.set(r.hostname, i));
    this.pipelines.sort((a, b) => {
      if (a.target === this.userTarget) return -1;
      if (b.target === this.userTarget) return 1;
      const ai = rankIndex.get(a.target) ?? Infinity;
      const bi = rankIndex.get(b.target) ?? Infinity;
      return ai - bi;
    });
  }

  // INVARIANT: must run AFTER step 6 (fill existing pipelines to maxDepth).
  // We open a new pipeline whenever allocator.peekTopHost() still returns
  // something, and rely on step 6 having already drained that RAM into every
  // existing pipeline that wanted it. Reorder this loop or add an early-exit
  // upstream and you'll silently start opening secondaries against
  // non-saturated primaries.
  private openAdditionalPipelinesIfRoom(ranked: ReturnType<typeof analyzeOptions>): void {
    const open = new Set(this.pipelines.map((p) => p.target));
    const player = this.ns.getPlayer();

    // Always open the user-pinned target first if it exists and isn't open.
    // We keep this one even if we couldn't schedule a batch yet — the pin is
    // user intent, and we want it visible in the UI so the user knows we're
    // tracking it.
    if (this.userTarget && !open.has(this.userTarget)) {
      const created = this.openPipeline(this.userTarget);
      if (created) {
        open.add(this.userTarget);
        this.pipelines.unshift(created);
        const depth = this.pipelineMaxDepth(created, player);
        while (created.inFlight.length < depth && this.tryScheduleOne(created)) {
          /* loop */
        }
      }
    }

    // Then walk the ranked list. Two gates before opening a secondary:
    //
    // 1. **Every existing active pipeline must be at maxDepth.** If primary
    //    is filling prep or is RAM-bound below maxDepth, surplus RAM stays
    //    idle rather than going to a less-profitable secondary that would
    //    compete with primary for hosts. This matches the rule that a
    //    secondary only makes sense once primary genuinely can't use more.
    // 2. **Auto-opened pipelines are only committed** if they manage to
    //    schedule at least one batch. Without this, ranked targets whose
    //    minimum batch RAM exceeds the leftover slivers would pile up as
    //    depth-0 entries on every cycle.
    //
    // Closing / healing pipelines are excluded from the saturation check —
    // they're not scheduling new batches anyway, so their depth is frozen.
    for (const option of ranked) {
      if (this.pipelines.length >= MAX_PIPELINES) break;
      if (open.has(option.hostname)) continue;
      if (!this.allocator.peekTopHost()) return; // no RAM left

      const active = this.pipelines.filter((p) => !p.closing && !p.healing);
      const allSaturated = active.every(
        (p) => p.inFlight.length >= this.pipelineMaxDepth(p, player),
      );
      if (!allSaturated) return;

      const created = this.openPipeline(option.hostname);
      if (!created) continue;
      const depth = this.pipelineMaxDepth(created, player);
      while (created.inFlight.length < depth && this.tryScheduleOne(created)) {
        /* loop */
      }
      if (created.inFlight.length === 0) continue; // nothing took; skip and free the slot
      this.pipelines.push(created);
      open.add(option.hostname);
    }
  }

  private openPipeline(targetHostname: string): Pipeline | undefined {
    const server = this.ns.getServer(targetHostname) as Server;
    // Match analyzeOptions' filter exactly. Skipping this gate would let a
    // degenerate server (purchased, no admin, undefined moneyAvailable, etc.)
    // reach simulateHWGW, where applyHack would propagate NaN into
    // formulas.hacking.growThreads and throw.
    if (!server || !isHackableServer(server)) return undefined;
    return {
      target: targetHostname,
      simServer: cloneServer(server),
      inFlight: [],
      nextScheduledFinish: 0,
      recentBatches: [],
      healing: false,
      closing: false,
      hwgwLandedThisReap: false,
    };
  }

  // ---------------------------------------------------------------------
  // Reap / drift / heal
  // ---------------------------------------------------------------------

  private reapPipeline(pipeline: Pipeline): void {
    pipeline.hwgwLandedThisReap = false;
    const stillRunning: InFlightBatch[] = [];
    for (const batch of pipeline.inFlight) {
      const someRunning = batch.pids.some((pid) => this.ns.isRunning(pid));
      if (someRunning) {
        stillRunning.push(batch);
      } else {
        this.allocator.return(batch.lease.leaseId);
        if (batch.purpose === "HWGW") pipeline.hwgwLandedThisReap = true;
      }
    }
    pipeline.inFlight = stillRunning;
  }

  private checkDriftAndHeal(pipeline: Pipeline): void {
    // If we're already healing and the in-flight queue has drained, rebase.
    if (pipeline.healing && pipeline.inFlight.length === 0) {
      const fresh = this.ns.getServer(pipeline.target) as Server;
      // If the target has degraded out of hackability between heal-start and
      // rebase (e.g., player lost admin), don't seed simServer with possibly
      // NaN/undefined fields — mark closing instead and let reconcile drop
      // it. The next analyzeOptions cycle will exclude this hostname anyway.
      if (!isHackableServer(fresh)) {
        pipeline.closing = true;
        pipeline.healing = false;
        this.log.warn(
          `[ultrahacker] ${pipeline.target} no longer hackable on rebase; closing pipeline`,
        );
        return;
      }
      pipeline.simServer = cloneServer(fresh);
      pipeline.nextScheduledFinish = 0;
      pipeline.recentBatches = [];
      pipeline.healing = false;
      this.log.info(`[ultrahacker] rebased ${pipeline.target} after drift heal`);
      return;
    }

    // Don't drift-check while already healing or closing.
    if (pipeline.healing || pipeline.closing) return;

    // Only check after an HWGW batch landed — at that instant simServer
    // should match the real server, and any gap is meaningful drift.
    if (!pipeline.hwgwLandedThisReap) return;

    // Compare to simServer (not min/max) so we also catch external
    // interference: a manual terminal hack/grow, another script touching
    // the target, etc. In steady-state HWGW simServer == min/max so this is
    // a strict generalization of the min/max check.
    const real = this.ns.getServer(pipeline.target) as Server;
    const dSec = Math.abs((real.hackDifficulty ?? 0) - (pipeline.simServer.hackDifficulty ?? 0));
    const dMoneyFraction =
      Math.abs((real.moneyAvailable ?? 0) - (pipeline.simServer.moneyAvailable ?? 0)) /
      Math.max(1, real.moneyMax ?? 1);

    if (dSec > DRIFT_SEC_TOLERANCE || dMoneyFraction > DRIFT_MONEY_FRACTION_TOLERANCE) {
      pipeline.healing = true;
      this.log.warn(
        `[ultrahacker] drift detected on ${pipeline.target}: dSec=${dSec.toFixed(3)} dMoney=${(dMoneyFraction * 100).toFixed(2)}%; draining ${pipeline.inFlight.length} batches`,
      );
    }
  }

  private tearDownAllPipelines(log: boolean): void {
    let totalPids = 0;
    let totalLeases = 0;
    for (const pipeline of this.pipelines) {
      for (const batch of pipeline.inFlight) {
        for (const pid of batch.pids) {
          if (this.ns.isRunning(pid)) {
            this.ns.kill(pid);
            totalPids++;
          }
        }
        this.allocator.return(batch.lease.leaseId);
        totalLeases++;
      }
      pipeline.inFlight = [];
    }
    this.pipelines = [];
    if (log) {
      this.log.info(`shutdown: killed ${totalPids} worker(s) across ${totalLeases} leases`);
    }
  }

  // ---------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------

  private tryScheduleOne(pipeline: Pipeline): boolean {
    const top = this.allocator.peekTopHost();
    if (!top) return false;

    // Plan against a clone so a mid-batch schedule failure (e.g. lease retry,
    // runScript failure) doesn't leave pipeline.simServer mutated past reality.
    // For W (security lowered) and GW (money raised) the mutation is
    // load-bearing; HWGW happens to be idempotent (it always normalizes to
    // min/max at the end), but committing only on full success keeps the
    // invariant uniform.
    //
    // Capture immutable snapshots of the real op-call state too. Batches
    // overlap by far more than BATCH_FRAME_OFFSET_MS, so by the time this
    // batch's scripts actually call ns.hack/grow/weaken, prior in-flight
    // batches haven't resolved yet — the real server/player state at op-call
    // time is approximately the snapshot, not the simulation's post-batch
    // state. findOptimalBatchFrame uses planServer for *sizing* state, and
    // the snapshots for op-duration formula reads. Mirrors v1's discipline at
    // ultrahacker/task.ts:185-208.
    const livePlayer = this.ns.getPlayer();
    const liveServer = this.ns.getServer(pipeline.target) as Server;
    const originalPlayer = clonePlayer(livePlayer);
    const originalTarget = cloneServer(liveServer);
    const planServer = cloneServer(pipeline.simServer);
    const frame = this.findOptimalBatchFrame(
      top.ram,
      top.cores,
      planServer,
      originalTarget,
      originalPlayer,
    );
    if (!frame) return false;

    const frameRam = this.calculateBatchFrameRam(frame);
    const lease = this.allocator.leaseUpTo(frameRam);
    if (!lease || lease.ram + RAM_EPS < frameRam) {
      if (lease) this.allocator.return(lease.leaseId);
      return false;
    }

    // Ensure nextScheduledFinish is far enough in the future for this batch's
    // earliest operation to start with a non-negative delay.
    const minFinish = Date.now() + this.firstFinishTimeFor(frame);
    if (pipeline.nextScheduledFinish < minFinish) {
      pipeline.nextScheduledFinish = minFinish;
    }

    const launched: number[] = [];
    let batchFinishEpoch: number;

    switch (frame.purpose) {
      case "W": {
        const weakFinish = pipeline.nextScheduledFinish;
        const weakDelay = Math.max(0, weakFinish - Date.now() - frame.weakTime1);
        const pidWeak = this.runScript(
          WEAKEN_SCRIPT,
          lease,
          frame.weakThreads1,
          pipeline.target,
          weakDelay,
        );
        if (!pidWeak) return false;
        launched.push(pidWeak);
        batchFinishEpoch = weakFinish;
        pipeline.nextScheduledFinish += BATCH_FRAME_OFFSET_MS;
        break;
      }
      case "GW": {
        const growFinish = pipeline.nextScheduledFinish;
        const weakFinish = pipeline.nextScheduledFinish + BATCH_FRAME_OFFSET_MS;
        const growDelay = Math.max(0, growFinish - Date.now() - frame.growTime);
        const weakDelay = Math.max(0, weakFinish - Date.now() - frame.weakTime1);

        const pidGrow = this.runScript(
          GROW_SCRIPT,
          lease,
          frame.growThreads,
          pipeline.target,
          growDelay,
        );
        if (!pidGrow) return false;
        launched.push(pidGrow);

        const pidWeak = this.runScript(
          WEAKEN_SCRIPT,
          lease,
          frame.weakThreads1,
          pipeline.target,
          weakDelay,
        );
        if (!pidWeak) {
          this.killLaunched(launched);
          return false;
        }
        launched.push(pidWeak);
        batchFinishEpoch = weakFinish;
        pipeline.nextScheduledFinish += 2 * BATCH_FRAME_OFFSET_MS;
        break;
      }
      case "HWGW": {
        const hackFinish = pipeline.nextScheduledFinish;
        const weak1Finish = pipeline.nextScheduledFinish + BATCH_FRAME_OFFSET_MS;
        const growFinish = pipeline.nextScheduledFinish + 2 * BATCH_FRAME_OFFSET_MS;
        const weak2Finish = pipeline.nextScheduledFinish + 3 * BATCH_FRAME_OFFSET_MS;

        const hackDelay = Math.max(0, hackFinish - Date.now() - frame.hackTime);
        const weak1Delay = Math.max(0, weak1Finish - Date.now() - frame.weakTime1);
        const growDelay = Math.max(0, growFinish - Date.now() - frame.growTime);
        const weak2Delay = Math.max(0, weak2Finish - Date.now() - frame.weakTime2);

        const pidHack = this.runScript(
          HACK_SCRIPT,
          lease,
          frame.hackThreads,
          pipeline.target,
          hackDelay,
        );
        if (!pidHack) return false;
        launched.push(pidHack);

        const pidWeak1 = this.runScript(
          WEAKEN_SCRIPT,
          lease,
          frame.weakThreads1,
          pipeline.target,
          weak1Delay,
        );
        if (!pidWeak1) {
          this.killLaunched(launched);
          return false;
        }
        launched.push(pidWeak1);

        const pidGrow = this.runScript(
          GROW_SCRIPT,
          lease,
          frame.growThreads,
          pipeline.target,
          growDelay,
        );
        if (!pidGrow) {
          this.killLaunched(launched);
          return false;
        }
        launched.push(pidGrow);

        const pidWeak2 = this.runScript(
          WEAKEN_SCRIPT,
          lease,
          frame.weakThreads2,
          pipeline.target,
          weak2Delay,
        );
        if (!pidWeak2) {
          this.killLaunched(launched);
          return false;
        }
        launched.push(pidWeak2);

        batchFinishEpoch = weak2Finish;
        pipeline.nextScheduledFinish += 4 * BATCH_FRAME_OFFSET_MS;
        break;
      }
    }

    pipeline.inFlight.push({
      purpose: frame.purpose,
      finishEpoch: batchFinishEpoch,
      lease,
      pids: launched,
    });
    // Commit the simulated state for the next plan now that everything launched.
    pipeline.simServer = planServer;
    pipeline.recentBatches.push(frame.purpose);
    if (pipeline.recentBatches.length > RECENT_BATCHES_KEEP) {
      pipeline.recentBatches.shift();
    }
    return true;
  }

  private killLaunched(pids: number[]): void {
    for (const pid of pids) {
      if (this.ns.isRunning(pid)) this.ns.kill(pid);
    }
  }

  // Minimum value `nextScheduledFinish - Date.now()` must take for the first
  // operation of `batch` to land with a non-negative delay.
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

  // ---------------------------------------------------------------------
  // Batch planning (same math as cohort code, just driven from simServer)
  // ---------------------------------------------------------------------

  // Find the largest batch frame we can fit given the maxRam and cores
  // constraints, and advance `target` (planServer) for the next plan.
  //
  // Mutates `target` (the pipeline's sizing state). `originalTarget` and
  // `originalPlayer` are read-only snapshots of the real op-call state —
  // used for every duration formula (weakenTime / growTime / hackTime) and
  // passed through to the thread-calc helpers. See tryScheduleOne's call
  // site for the rationale: batches overlap, so prior in-flight effects
  // haven't resolved at the new batch's op-call time, and the snapshot
  // approximates the real game state at that moment.
  //
  // No applyHackingExp calls — v1 removed these for the same reason (see
  // ultrahacker/task.ts:519-522). Per-batch XP doesn't match reality at
  // op-call time and shrinks predicted durations, corrupting the schedule.
  private findOptimalBatchFrame(
    hostMaxRam: number,
    hostCores: number,
    target: Server,
    originalTarget: Server,
    originalPlayer: Player,
  ): BatchFrame | undefined {
    let frame = {
      purpose: "HWGW",
      growThreads: 0,
      growTime: 0,
      weakThreads1: 0,
      weakTime1: 0,
      weakThreads2: 0,
      weakTime2: 0,
      hackThreads: 0,
      hackTime: 0,
    } as BatchFrame;

    if (target.hackDifficulty! > target.minDifficulty!) {
      frame.purpose = "W";
    } else if (target.moneyAvailable! < target.moneyMax!) {
      frame.purpose = "GW";
    }

    const weakSecurityDecreasePerThread = this.ns.formulas.hacking.weakenEffect(1, hostCores);

    switch (frame.purpose) {
      case "W": {
        const targetWeak = Math.ceil(
          (target.hackDifficulty! - target.minDifficulty!) / weakSecurityDecreasePerThread,
        );
        const partial = targetWeak * this.weakRam > hostMaxRam;
        frame.weakThreads1 = partial ? Math.floor(hostMaxRam / this.weakRam) : targetWeak;
        if (frame.weakThreads1 === 0) return undefined;
        // Duration read against the snapshot (real op-call state).
        frame.weakTime1 = this.ns.formulas.hacking.weakenTime(originalTarget, originalPlayer);
        applyWeak(this.ns, target, frame.weakThreads1, hostCores);
        // FP-residue guard: if the thread count was sized to reach min (i.e.
        // not RAM-truncated), force the sim state to exactly min so the next
        // plan doesn't loop on a `min + epsilon` value and schedule a
        // 1-thread W batch.
        if (!partial) target.hackDifficulty = target.minDifficulty!;
        break;
      }
      case "GW": {
        const split = tryFindGrowWeakSplit(this.ns, hostMaxRam, hostCores, originalPlayer, target);
        if (!split) return undefined;
        frame.growThreads = split.growThreads;
        frame.weakThreads1 = split.weakThreads;
        // Durations against the snapshot. In the W → GW transition, `target`
        // has been simulated down to min security, but in reality those W
        // weakens haven't resolved at the GW grow's op-call time, so the
        // real server security is still ~the snapshot's.
        frame.growTime = this.ns.formulas.hacking.growTime(originalTarget, originalPlayer);
        frame.weakTime1 = this.ns.formulas.hacking.weakenTime(originalTarget, originalPlayer);
        // Detect "intended full" GW: if growThreads >= maxGrowThreadsNeeded,
        // the grow was sized to reach moneyMax. Force-clamp money to
        // moneyMax after applyGrow to absorb formula FP residue and prevent
        // a follow-up 1-thread GW batch.
        const maxGrow = this.ns.formulas.hacking.growThreads(
          target,
          originalPlayer,
          target.moneyMax!,
          hostCores,
        );
        applyGrow(this.ns, target, originalPlayer, frame.growThreads, hostCores, true);
        // weak1 is sized to undo grow's security increase; assume back at min.
        target.hackDifficulty = target.minDifficulty;
        if (frame.growThreads >= maxGrow) target.moneyAvailable = target.moneyMax;
        break;
      }
      case "HWGW": {
        const split = tryFindHackWeakGrowWeakSplit(
          this.ns,
          hostMaxRam,
          hostCores,
          originalPlayer,
          target,
        );
        if (!split) return undefined;
        frame.hackThreads = split.hackThreads;
        frame.weakThreads1 = split.weak1Threads;
        frame.growThreads = split.growThreads;
        frame.weakThreads2 = split.weak2Threads;
        // Durations against the snapshot. HWGW is self-balancing, so target
        // and originalTarget happen to agree on security/money — reading
        // from the snapshot is consistent with W/GW and avoids future drift.
        frame.hackTime = this.ns.formulas.hacking.hackTime(originalTarget, originalPlayer);
        frame.weakTime1 = this.ns.formulas.hacking.weakenTime(originalTarget, originalPlayer);
        frame.growTime = this.ns.formulas.hacking.growTime(originalTarget, originalPlayer);
        frame.weakTime2 = this.ns.formulas.hacking.weakenTime(originalTarget, originalPlayer);
        // HWGW is self-balancing — assume back at min/max for next plan.
        target.hackDifficulty = target.minDifficulty;
        target.moneyAvailable = target.moneyMax;
        break;
      }
    }

    return frame;
  }

  private calculateBatchFrameRam(batch: BatchFrame): number {
    let usedRam = this.weakRam * batch.weakThreads1;
    if (batch.growThreads) usedRam += batch.growThreads * this.growRam;
    if (batch.hackThreads) usedRam += batch.hackThreads * this.hackRam;
    if (batch.weakThreads2) usedRam += batch.weakThreads2 * this.weakRam;
    return usedRam;
  }

  // ---------------------------------------------------------------------
  // Pipeline depth + snapshot
  // ---------------------------------------------------------------------

  private pipelineMaxDepth(pipeline: Pipeline, player: Player): number {
    // Depth = floor(weakTime / HWGW_BATCH_INTERVAL_MS). Each HWGW batch
    // occupies 200ms of pipeline time (4 ops × 50ms), so weakTime=4000ms holds
    // ~20 in flight at steady state. Using BATCH_FRAME_OFFSET_MS (50ms) here
    // would 4× overstate capacity, holding RAM for scripts that just sleep on
    // additionalMsec.
    //
    // Prep batches (W = 50ms, GW = 100ms) could in principle stack denser, but
    // prep is short-lived; the conservative HWGW cap is the right tradeoff.
    //
    // weakTime is read against the simServer forced to min/max so we get the
    // steady-state bound, independent of any in-progress prep state.
    const optimal = cloneServer(pipeline.simServer);
    optimal.hackDifficulty = optimal.minDifficulty;
    optimal.moneyAvailable = optimal.moneyMax;
    const weakTime = this.ns.formulas.hacking.weakenTime(optimal, player);
    return Math.max(1, Math.min(MAX_PIPELINE_DEPTH, Math.floor(weakTime / HWGW_BATCH_INTERVAL_MS)));
  }

  private snapshotPipeline(pipeline: Pipeline, player: Player): PipelineSnapshot {
    const observed = this.ns.getServer(pipeline.target) as Server;
    const soonest = pipeline.inFlight.length
      ? pipeline.inFlight.reduce(
          (min, b) => (b.finishEpoch < min ? b.finishEpoch : min),
          pipeline.inFlight[0].finishEpoch,
        )
      : 0;
    return {
      target: pipeline.target,
      inFlightCount: pipeline.inFlight.length,
      maxDepth: this.pipelineMaxDepth(pipeline, player),
      recentBatches: [...pipeline.recentBatches],
      targetCurrentSecurity: observed.hackDifficulty ?? 0,
      targetMinSecurity: observed.minDifficulty ?? 0,
      targetCurrentMoney: observed.moneyAvailable ?? 0,
      targetMaxMoney: observed.moneyMax ?? 0,
      soonestFinishEpoch: soonest,
      healing: pipeline.healing,
    };
  }

  private computeSleepMs(): number {
    let soonest = Infinity;
    const now = Date.now();
    for (const pipeline of this.pipelines) {
      for (const batch of pipeline.inFlight) {
        if (batch.finishEpoch < soonest) soonest = batch.finishEpoch;
      }
    }
    if (soonest === Infinity) return MAX_POLL_MS;
    const target = soonest - now;
    if (target < MIN_POLL_MS) return MIN_POLL_MS;
    if (target > MAX_POLL_MS) return MAX_POLL_MS;
    return target;
  }
}

function cloneServer(s: Server): Server {
  return { ...s };
}

// Spread-copy player, including the nested objects that applyGrow / formula
// reads care about. Mirror of the helper in v1's threadCalculations.ts.
function clonePlayer(p: Player): Player {
  return {
    ...p,
    skills: { ...p.skills },
    exp: { ...p.exp },
  };
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new UltrahackerV2Task(ns).start();
}
