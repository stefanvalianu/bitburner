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
import { applyGrow, applyHackingExp, applyWeak } from "./simulationHelpers";
import { analyzeOptions } from "./analyzeOptions";
import { getPortData, HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";

// number of milliseconds between scheduled operation landings within a batch
const BATCH_FRAME_OFFSET_MS = 50;

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

      // 1. Consume any user pin/unpin request. We don't kill existing pipelines —
      //    pinning just promotes a target. The keep-set step will close anything
      //    that no longer qualifies, draining naturally.
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
    this.userTarget = req.targetServer;
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

  private openAdditionalPipelinesIfRoom(ranked: ReturnType<typeof analyzeOptions>): void {
    const open = new Set(this.pipelines.map((p) => p.target));

    // Always open the user-pinned target first if it exists and isn't open.
    if (this.userTarget && !open.has(this.userTarget)) {
      const created = this.openPipeline(this.userTarget);
      if (created) {
        open.add(this.userTarget);
        this.pipelines.unshift(created);
        // Take a swing at filling it before considering additional targets.
        const player = this.ns.getPlayer();
        const depth = this.pipelineMaxDepth(created, player);
        while (created.inFlight.length < depth && this.tryScheduleOne(created)) {
          /* loop */
        }
      }
    }

    // Then walk the ranked list adding pipelines while RAM permits.
    for (const option of ranked) {
      if (this.pipelines.length >= MAX_PIPELINES) break;
      if (open.has(option.hostname)) continue;
      if (!this.allocator.peekTopHost()) return; // no RAM left
      // Only open if a previous pipeline saturated, signalled by "we still have
      // RAM and none of the current pipelines wanted another batch this cycle".
      // The simplest proxy: if peekTopHost still returns RAM after step 6's
      // fill, there's surplus. Try opening this target.
      const created = this.openPipeline(option.hostname);
      if (!created) continue;
      this.pipelines.push(created);
      open.add(option.hostname);
      const player = this.ns.getPlayer();
      const depth = this.pipelineMaxDepth(created, player);
      while (created.inFlight.length < depth && this.tryScheduleOne(created)) {
        /* loop */
      }
    }
  }

  private openPipeline(targetHostname: string): Pipeline | undefined {
    const server = this.ns.getServer(targetHostname) as Server;
    if (!server || server.moneyMax === undefined || server.moneyMax <= 0) return undefined;
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
      pipeline.simServer = cloneServer(fresh);
      pipeline.nextScheduledFinish = 0;
      pipeline.healing = false;
      this.log.info(`[ultrahacker] rebased ${pipeline.target} after drift heal`);
      return;
    }

    // Don't drift-check while already healing or closing.
    if (pipeline.healing || pipeline.closing) return;

    // Only check after an HWGW batch landed — at that instant the real server
    // should be back at min security / max money, and divergence is meaningful.
    if (!pipeline.hwgwLandedThisReap) return;

    const real = this.ns.getServer(pipeline.target) as Server;
    const dSec = (real.hackDifficulty ?? 0) - (real.minDifficulty ?? 0);
    const dMoneyFraction =
      ((real.moneyMax ?? 0) - (real.moneyAvailable ?? 0)) / Math.max(1, real.moneyMax ?? 1);

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

    const player = this.ns.getPlayer();
    const frame = this.findOptimalBatchFrame(top.ram, top.cores, pipeline.simServer, player);
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
  // constraints, and advance the pipeline's simServer for the next plan.
  // Mutates `target` (the pipeline's simServer) and `player`.
  private findOptimalBatchFrame(
    hostMaxRam: number,
    hostCores: number,
    target: Server,
    player: Player,
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

    // INVARIANT: each case reads all formula values (durations, XP) against
    // the pre-batch state of `target`/`player` BEFORE applying mutations.
    // In real execution every script in a batch launches when the server is
    // at min security and (for HWGW) max money — durations are locked at
    // launch, so the formula reads happen against that pristine state.
    switch (frame.purpose) {
      case "W": {
        frame.weakThreads1 = Math.ceil(
          (target.hackDifficulty! - target.minDifficulty!) / weakSecurityDecreasePerThread,
        );
        const weakRamNeeded = frame.weakThreads1 * this.weakRam;
        if (weakRamNeeded > hostMaxRam) {
          frame.weakThreads1 = Math.floor(hostMaxRam / this.weakRam);
        }
        if (frame.weakThreads1 === 0) return undefined;
        frame.weakTime1 = this.ns.formulas.hacking.weakenTime(target, player);
        applyHackingExp(this.ns, target, player, frame.weakThreads1);
        applyWeak(this.ns, target, frame.weakThreads1, hostCores);
        break;
      }
      case "GW": {
        const split = tryFindGrowWeakSplit(this.ns, hostMaxRam, hostCores, player, target);
        if (!split) return undefined;
        frame.growThreads = split.growThreads;
        frame.weakThreads1 = split.weakThreads;
        frame.growTime = this.ns.formulas.hacking.growTime(target, player);
        frame.weakTime1 = this.ns.formulas.hacking.weakenTime(target, player);
        applyHackingExp(this.ns, target, player, frame.growThreads);
        applyHackingExp(this.ns, target, player, frame.weakThreads1);
        applyGrow(this.ns, target, player, frame.growThreads, hostCores, true);
        // weak1 is sized to undo grow's security increase; assume back at min.
        target.hackDifficulty = target.minDifficulty;
        break;
      }
      case "HWGW": {
        const split = tryFindHackWeakGrowWeakSplit(this.ns, hostMaxRam, hostCores, player, target);
        if (!split) return undefined;
        frame.hackThreads = split.hackThreads;
        frame.weakThreads1 = split.weak1Threads;
        frame.growThreads = split.growThreads;
        frame.weakThreads2 = split.weak2Threads;
        frame.hackTime = this.ns.formulas.hacking.hackTime(target, player);
        frame.weakTime1 = this.ns.formulas.hacking.weakenTime(target, player);
        frame.growTime = this.ns.formulas.hacking.growTime(target, player);
        frame.weakTime2 = this.ns.formulas.hacking.weakenTime(target, player);
        applyHackingExp(this.ns, target, player, frame.hackThreads);
        applyHackingExp(this.ns, target, player, frame.weakThreads1);
        applyHackingExp(this.ns, target, player, frame.growThreads);
        applyHackingExp(this.ns, target, player, frame.weakThreads2);
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
    // Depth is bounded by weakTime / BATCH_FRAME_OFFSET_MS — a pipeline with
    // weakTime=4000ms can hold ~80 batches before they'd start overlapping.
    // We use the simServer (at min/max) so depth reflects steady-state, not
    // any in-progress prep state.
    const optimal = cloneServer(pipeline.simServer);
    optimal.hackDifficulty = optimal.minDifficulty;
    optimal.moneyAvailable = optimal.moneyMax;
    const weakTime = this.ns.formulas.hacking.weakenTime(optimal, player);
    return Math.max(1, Math.min(MAX_PIPELINE_DEPTH, Math.floor(weakTime / BATCH_FRAME_OFFSET_MS)));
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

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new UltrahackerV2Task(ns).start();
}
