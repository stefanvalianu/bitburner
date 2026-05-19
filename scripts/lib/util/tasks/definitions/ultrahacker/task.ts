import { NS, Player, Server } from "@ns";
import { UltrahackerTaskState, ULTRAHACKER_TASK_ID, UserCommunicationRequest } from "./info";
import { BaseSpawnerTask } from "../../baseSpawnerTask";
import { Lease, RAM_EPS } from "../../allocator";
import { GROW_SCRIPT, HACK_SCRIPT, WEAKEN_SCRIPT } from "../../../script/constants";
import { tryFindGrowWeakSplit, tryFindHackWeakGrowWeakSplit } from "./threadCalculations";
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
      const options = analyzeOptions(this.ns, player, this.snapshot.allServers);
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

      // 4. Greedy schedule pass: place as many batches as RAM allows.
      this.scheduleAsMuchAsPossible(this.pipeline!, player);

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
      postSecurity: server.hackDifficulty!,
      postMoney: server.moneyAvailable!,
      nextFinishTime: Date.now(),
      inFlight: [],
    };
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
  // passed in here — fresh enough across a single burst.
  private scheduleAsMuchAsPossible(pipeline: PipelineState, currentPlayer: Player): void {
    while (true) {
      const top = this.allocator.peekTopHost();
      if (!top) break;

      // Refresh current server snapshot per batch — op-duration formulas
      // read against fresh server state.
      const currentTarget = this.ns.getServer(pipeline.hostname) as Server;

      const frame = this.findOptimalBatchFrame(
        top.ram,
        top.cores,
        pipeline,
        currentTarget,
        currentPlayer,
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
  // INVARIANT (carried from the round-based version):
  // - Thread counts size against `sizingTarget` (current server data
  //   overridden with the pipeline's post-state). This expresses "after all
  //   currently-in-flight batches resolve, the server will look like this —
  //   size threads for that state."
  // - Op-duration formulas read against `(currentTarget, currentPlayer)`.
  //   `currentTarget` is a fresh ns.getServer per batch; `currentPlayer` is
  //   sampled once at the top of the tick. By the time this batch's
  //   hack/grow/weaken actually fires (after its additionalMsec), prior
  //   in-flight batches have NOT resolved (they overlap), so the real
  //   op-call-time state ≈ now ≈ (currentTarget, currentPlayer).
  // - `currentPlayer` is NOT augmented with simulated XP from prior batches —
  //   that drift caused the original timing bug.
  private findOptimalBatchFrame(
    hostMaxRam: number,
    hostCores: number,
    pipeline: PipelineState,
    currentTarget: Server,
    currentPlayer: Player,
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
        const split = tryFindGrowWeakSplit(
          this.ns,
          hostMaxRam,
          hostCores,
          currentPlayer,
          sizingTarget,
        );
        if (!split) return undefined;
        frame.growThreads = split.growThreads;
        frame.weakThreads1 = split.weakThreads;
        frame.growTime = this.ns.formulas.hacking.growTime(currentTarget, currentPlayer);
        frame.weakTime1 = this.ns.formulas.hacking.weakenTime(currentTarget, currentPlayer);
        break;
      }

      case "HWGW": {
        const split = tryFindHackWeakGrowWeakSplit(
          this.ns,
          hostMaxRam,
          hostCores,
          currentPlayer,
          sizingTarget,
        );
        if (!split) return undefined;
        frame.hackThreads = split.hackThreads;
        frame.weakThreads1 = split.weak1Threads;
        frame.growThreads = split.growThreads;
        frame.weakThreads2 = split.weak2Threads;
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
