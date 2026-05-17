import { NS, Player, Server } from "@ns";
import {
  UltrahackerTaskState,
  ULTRAHACKER_TASK_ID,
  UserCommunicationRequest,
  FramePurpose,
} from "./info";
import { BaseSpawnerTask, TaskLease } from "../../baseSpawnerTask";
import { Lease, RAM_EPS } from "../../allocator";
import { GROW_SCRIPT, HACK_SCRIPT, WEAKEN_SCRIPT } from "../../../script/constants";
import {
  clonePlayer,
  cloneServer,
  tryFindGrowWeakSplit,
  tryFindHackWeakGrowWeakSplit,
} from "./threadCalculations";
import { applyGrow, applyWeak } from "./simulationHelpers";
import { analyzeOptions } from "./analyzeOptions";
import { getPortData, HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";

// number of miliseconds to aim for between batched operations
const BATCH_FRAME_OFFSET_MS = 50;

// ideally, do not allow a single hack to take a machine lower than
// this % of its max money. This will not always be possible (super
// high levels, etc) but this is aspirationally the ideal amount.
// the absolute MINIMUM number of hack threads has to be 1, and it
// might be possible that 1 thread goes below this percentage.
export const HACK_MINIMUM_MONEY_PCT = 0.66;

interface BatchFrame {
  // how many hack threads this frame will require
  hackThreads: number;

  // how long hack is expected to take
  hackTime: number;

  // how many grow threads this frame will require
  growThreads: number;

  // how long grow is expected to take
  growTime: number;

  // how many weak threads the first weak requires
  weakThreads1: number;

  // how long the first weak is expected to take
  weakTime1: number;

  // how many weak threads the second weak requires
  weakThreads2: number;

  // how long the second weak time is expected to take
  weakTime2: number;

  // simpler way to track the purpose of the frame
  purpose: FramePurpose;
}

interface BatchLease {
  lease: Lease;
  batch: BatchFrame;
}

interface BatchSchedule {
  taskLeases: TaskLease[];

  estimatedTime: number;
}

class UltrahackerTask extends BaseSpawnerTask<UltrahackerTaskState> {
  private readonly hackRam: number;
  private readonly growRam: number;
  private readonly weakRam: number;

  private userTarget: string | undefined = undefined;

  constructor(ns: NS) {
    super(ns, ULTRAHACKER_TASK_ID);

    this.hackRam = this.ns.getScriptRam(HACK_SCRIPT);
    this.growRam = this.ns.getScriptRam(GROW_SCRIPT);
    this.weakRam = this.ns.getScriptRam(WEAKEN_SCRIPT);
  }

  protected async run_task(): Promise<void> {
    while (true) {
      if (this.shouldShutdown) {
        this.teardown(true);
        return;
      }

      // figure out the best target (and consume user requests to change it)
      const targetOptions = analyzeOptions(this.ns, this.ns.getPlayer(), this.snapshot.allServers);
      const userRequest = getPortData<UserCommunicationRequest>(
        this.ns,
        HACKING_SYSTEM_COMMUNICATION_PORT,
        true,
      );

      if (userRequest) {
        this.userTarget = userRequest.targetServer;

        // shut off currently running tasks abruptly
        this.teardown();
      }

      const targetServer = this.ns.getServer(
        this.userTarget ?? targetOptions[0].hostname,
      ) as Server;

      // For a single run of this hacker, we will fill up all available allocated slots
      // with batch frames. We will not re-calculate new batches until all of these
      // lease are empty, which means there might be a lot of downtime between target
      // swaps. We might want to re-visit this and make this more responsive later.
      // Note shutdown checks are periodically done in the base class' wait.
      // This step is responsible both for finding all usable space using the allocator,
      // and filling all of the space sequentially with batch frames that we want to
      // execute to appropriately hack the server.
      const batchLeases = this.getBatchLeases(targetServer.hostname);
      if (batchLeases.length === 0) {
        this.log.error(
          `Tried computing batch leases but ended with nothing. Do we have enough RAM?`,
        );
        return;
      }

      // Then, we need to schedule all of these frames with appropriate deltas between
      // each of the steps in the frame (grow/weaken/hack). This happens in 3 'waves' that
      // are not discretely separated like they were in noform hacker. The first set of
      // batch frames will attempt to bring the server to min security using only weaken
      // batches. As soon as that's done (possibly in the same run of this cycle), we will
      // begin growing the server using grow/weak batches. As soon as that's done, we will
      // continuously use hack/weak/grow/weak batches. If all calculations are correct, once
      // a server reaches max money, it should never regress into needing weak-only or
      // grow-weak only batches.
      const batchSchedule = this.scheduleBatches(batchLeases, targetServer.hostname);
      if (batchSchedule.taskLeases.length !== batchLeases.length) {
        this.log.error(
          `Tried to schedule ${batchLeases.length} batches but ended with ${batchSchedule.taskLeases.length} tasks?`,
        );
        return;
      }

      // patch the state here so we can include our lease visualization
      this.patchState({
        targetOptions: targetOptions,
        userTarget: this.userTarget,
        target: targetServer.hostname,
        batches: batchLeases.map((b) => b.batch.purpose),
        targetCurrentSecurity: targetServer.hackDifficulty!,
        targetMinSecurity: targetServer.minDifficulty!,
        targetCurrentMoney: targetServer.moneyAvailable!,
        targetMaxMoney: targetServer.moneyMax!,
        estimatedFinishTime: Date.now() + batchSchedule.estimatedTime,
      });

      // if we receive a port request, we'll exit the loop early
      const shouldExitEarly = (): boolean => {
        const hasComms = this.ns.peek(HACKING_SYSTEM_COMMUNICATION_PORT) !== "NULL PORT DATA";

        if (!hasComms) return false;

        this.log.info(`Ultrahacker exiting wait early due to user communication`);
        return true;
      };

      // Now we simply wait for our frames to be done, and this round of batches will be
      // complete.
      await this.waitAndFreeTaskLeases(batchSchedule.taskLeases, batchSchedule.estimatedTime, {
        forceKillOnExit: true,
        waitAsLongAsNeeded: true,
        shouldExitEarly: shouldExitEarly,
      });
    }
  }

  // First, compute all of the batches we're going to run / get space for them.
  private getBatchLeases(targetHostname: string): BatchLease[] {
    let leases: BatchLease[] = [];

    // `target` is mutated across iterations to advance the *sizing* state for
    // the next batch (security and money decisions like W → GW → HWGW phase
    // transitions and per-batch thread counts). `originalTarget` /
    // `originalPlayer` are unmutated snapshots used for the *op-time* formula
    // reads, because batches overlap by far more than BATCH_FRAME_OFFSET_MS —
    // by the time batch K's scripts actually call ns.hack/grow/weaken, prior
    // batches' effects haven't resolved yet, so the real game state at op-call
    // time is approximately the snapshot, not the simulation's post-batch
    // state. See findOptimalBatchFrame for the full invariant.
    const target = this.ns.getServer(targetHostname) as Server;
    const player = this.ns.getPlayer();
    const originalTarget = cloneServer(target);
    const originalPlayer = clonePlayer(player);

    while (true) {
      // take a look at what we have available for our next lease. let's use it to figure out
      // the biggest, meaningful batch we can fit on this lease. this has an upper limit
      // since for a single batch, we only want as many hack threads
      const top = this.allocator.peekTopHost();
      if (!top) break;

      // computing the batch frame will mutate `target`'s security/money so the
      // next iteration sizes its threads against the post-batch state. Player
      // is intentionally NOT mutated between batches (prior batches' XP hasn't
      // been earned yet at the next batch's op-call time).
      const batchFrame = this.findOptimalBatchFrame(
        top.ram,
        top.cores,
        target,
        player,
        originalTarget,
        originalPlayer,
      );
      if (!batchFrame) break;

      const batchFrameRam = this.calculateBatchFrameRam(batchFrame);
      const lease = this.allocator.leaseUpTo(batchFrameRam);
      // Epsilon-tolerant compare: leaseUpTo can hand back a value a hair below
      // the request due to FP residue in the pool entry; treat that as success.
      if (!lease || lease.ram + RAM_EPS < batchFrameRam) {
        // this shouldn't happen. it would imply either there's a core bug or something else
        // took resources from the allocator inbetween our peek and our lease call
        this.log.error(
          `Computed a batch frame using allocator.peek(), but were unable to actually reserve it.`,
          batchFrame,
        );
        break;
      }

      leases.push({
        lease: lease,
        batch: batchFrame,
      });
    }

    return leases;
  }

  // Minimum value `nextFinishTime` must take for the first operation of `batch`
  // to land with a non-negative delay. Each batch type has a different earliest
  // operation: W is just weak, GW is grow, HWGW is hack. Computing this per
  // batch (rather than once for batches[0]) is what lets the schedule survive a
  // mixed-purpose list like [W, GW, HWGW] without delays clamping to 0.
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

  // Responsible for actually executing the batches and returning the
  // TaskLease objects we'll wait on
  private scheduleBatches(batches: BatchLease[], targetHostname: string): BatchSchedule {
    let taskLeases: TaskLease[] = [];

    let lastFinishTime = 0;
    let nextFinishTime = 0;

    for (const batch of batches) {
      // Ensure nextFinishTime is large enough for THIS batch's first operation.
      // Without this, e.g. a [W, HWGW] sequence sized for W would try to land
      // HWGW's hack before hackTime has elapsed, and Math.max(0, …) would clamp
      // the delay to 0 — desyncing the schedule.
      nextFinishTime = Math.max(nextFinishTime, this.firstFinishTimeFor(batch.batch));

      switch (batch.batch.purpose) {
        case "W":
          {
            const targetWeakFinishTime = nextFinishTime;

            const weakDelay = Math.max(0, targetWeakFinishTime - batch.batch.weakTime1);

            const pidWeak = this.runScript(
              WEAKEN_SCRIPT,
              batch.lease,
              batch.batch.weakThreads1,
              targetHostname,
              weakDelay,
            );

            if (!pidWeak) {
              this.log.error(`Catastrophic failure; unable to run weak script in batch.`, batch);
              continue;
            }

            taskLeases.push({
              lease: batch.lease,
              pids: [pidWeak],
            });

            lastFinishTime = targetWeakFinishTime;
            nextFinishTime += BATCH_FRAME_OFFSET_MS;
          }
          break;

        case "GW":
          {
            const targetGrowFinishTime = nextFinishTime;
            const targetWeakFinishTime = nextFinishTime + BATCH_FRAME_OFFSET_MS;

            const growDelay = Math.max(0, targetGrowFinishTime - batch.batch.growTime);
            const weakDelay = Math.max(0, targetWeakFinishTime - batch.batch.weakTime1);

            // Track PIDs so partial failure can kill orphans rather than leak them.
            // runScript already returns the lease on failure, so we only need to
            // clean up the PIDs of scripts that did launch.
            const launched: number[] = [];

            const pidGrow = this.runScript(
              GROW_SCRIPT,
              batch.lease,
              batch.batch.growThreads,
              targetHostname,
              growDelay,
            );

            if (!pidGrow) {
              this.log.error(`Catastrophic failure; unable to run grow script in batch.`, batch);
              continue;
            }
            launched.push(pidGrow);

            const pidWeak = this.runScript(
              WEAKEN_SCRIPT,
              batch.lease,
              batch.batch.weakThreads1,
              targetHostname,
              weakDelay,
            );

            if (!pidWeak) {
              this.log.error(
                `Catastrophic failure; unable to run weak script in batch. Killing already-launched PIDs.`,
                batch,
              );
              launched.forEach((p) => this.ns.kill(p));
              continue;
            }
            launched.push(pidWeak);

            taskLeases.push({
              lease: batch.lease,
              pids: launched,
            });

            lastFinishTime = targetWeakFinishTime;
            nextFinishTime += 2 * BATCH_FRAME_OFFSET_MS;
          }
          break;

        case "HWGW":
          {
            const targetHackFinishTime = nextFinishTime;
            const targetWeak1FinishTime = nextFinishTime + BATCH_FRAME_OFFSET_MS;
            const targetGrowFinishTime = nextFinishTime + 2 * BATCH_FRAME_OFFSET_MS;
            const targetWeak2FinishTime = nextFinishTime + 3 * BATCH_FRAME_OFFSET_MS;

            const hackDelay = Math.max(0, targetHackFinishTime - batch.batch.hackTime);
            const weak1Delay = Math.max(0, targetWeak1FinishTime - batch.batch.weakTime1);
            const growDelay = Math.max(0, targetGrowFinishTime - batch.batch.growTime);
            const weak2Delay = Math.max(0, targetWeak2FinishTime - batch.batch.weakTime2);

            const launched: number[] = [];

            const pidHack = this.runScript(
              HACK_SCRIPT,
              batch.lease,
              batch.batch.hackThreads,
              targetHostname,
              hackDelay,
            );

            if (!pidHack) {
              this.log.error(`Catastrophic failure; unable to run hack script in batch.`, batch);
              continue;
            }
            launched.push(pidHack);

            const pidWeak1 = this.runScript(
              WEAKEN_SCRIPT,
              batch.lease,
              batch.batch.weakThreads1,
              targetHostname,
              weak1Delay,
            );

            if (!pidWeak1) {
              this.log.error(
                `Catastrophic failure; unable to run weak 1 script in batch. Killing already-launched PIDs.`,
                batch,
              );
              launched.forEach((p) => this.ns.kill(p));
              continue;
            }
            launched.push(pidWeak1);

            const pidGrow = this.runScript(
              GROW_SCRIPT,
              batch.lease,
              batch.batch.growThreads,
              targetHostname,
              growDelay,
            );

            if (!pidGrow) {
              this.log.error(
                `Catastrophic failure; unable to run grow script in batch. Killing already-launched PIDs.`,
                batch,
              );
              launched.forEach((p) => this.ns.kill(p));
              continue;
            }
            launched.push(pidGrow);

            const pidWeak2 = this.runScript(
              WEAKEN_SCRIPT,
              batch.lease,
              batch.batch.weakThreads2,
              targetHostname,
              weak2Delay,
            );

            if (!pidWeak2) {
              this.log.error(
                `Catastrophic failure; unable to run weak 2 script in batch. Killing already-launched PIDs.`,
                batch,
              );
              launched.forEach((p) => this.ns.kill(p));
              continue;
            }
            launched.push(pidWeak2);

            taskLeases.push({
              lease: batch.lease,
              pids: launched,
            });

            lastFinishTime = targetWeak2FinishTime;
            nextFinishTime += 4 * BATCH_FRAME_OFFSET_MS;
          }
          break;
      }
    }

    return {
      taskLeases: taskLeases,
      estimatedTime: lastFinishTime,
    };
  }

  // Find the largest batch frame we can fit given the maxRam
  // and cores constraints. Note the maxRam is NOT the maxRam
  // of the server, but rather the maxRam we are allowed to
  // use for this batch frame. This is so that we can ensure
  // we fit this frame into our allocator's lease system.
  // Returns undefined if a complete frame cannot be placed
  private findOptimalBatchFrame(
    hostMaxRam: number,
    hostCores: number,
    target: Server,
    player: Player,
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

    // first, determine the purpose of this frame.
    if (target.hackDifficulty! > target.minDifficulty!) {
      // server is not at min security, it needs to be weakened
      frame.purpose = "W";
    } else if (target.moneyAvailable! < target.moneyMax!) {
      // server is not at max money, it needs to be grown
      frame.purpose = "GW";
    }

    // how much does 1 thread of weak() reduce security
    const weakSecurityDecreasePerThread = this.ns.formulas.hacking.weakenEffect(1, hostCores);

    // INVARIANT: op-duration formula reads use the SNAPSHOT pair
    // (originalTarget, originalPlayer), not the mutated (target, player).
    //
    // The game locks each op's duration when ns.hack/grow/weaken is called
    // (after the script's sleep(delay)), based on the player's hacking skill
    // and the server's security level AT THAT MOMENT (see NS docs on hack,
    // grow, weaken). Within a single batch all four ops are launched in a
    // tight window — no in-batch op has resolved yet, so they all see the
    // batch-start state.
    //
    // Crucially: batches OVERLAP. Batch K's scripts call hack/grow/weaken at
    // roughly the same wall-clock time as batch K-1's (they're staggered by
    // ~BATCH_FRAME_OFFSET_MS, while each op's runtime is one weakTime / 3.2
    // hackTimes long). So at batch K's op-call time, prior batches have NOT
    // resolved — neither their player XP nor their server security/money
    // effects are visible in the real game. The real op-call state is
    // approximately the snapshot taken at the start of getBatchLeases.
    //
    // Therefore: read durations against (originalTarget, originalPlayer).
    // Mutations to `target` (security/money) below are kept ONLY to advance
    // the *sizing* state for the next batch — they tell the next iteration
    // "how much security is left to remove" or "we've transitioned to GW".
    // `player` is intentionally not mutated; the previously-applied per-batch
    // XP did not match reality and caused the simulated player to drift
    // higher than the real player at op-call time, shrinking simulated
    // durations and corrupting the schedule.
    switch (frame.purpose) {
      // The weaken phase aims to bring the server to minimum security level. Once it reaches that state, all remaining
      // frames must preserve this at the end of their run. If a frame that sufficiently weakens the server back to minimum
      // phase cannot be created, then no frame can be created and we should return undefined.
      // In this phase, only frame.weak1 is applied.
      case "W":
        {
          // how many threads of weak() are needed to bring security to min.
          // Sized against `target` (the mutated sizing-state) so successive W
          // batches whittle down the remaining security.
          frame.weakThreads1 = Math.ceil(
            (target.hackDifficulty! - target.minDifficulty!) / weakSecurityDecreasePerThread,
          );
          const weakRamNeeded = frame.weakThreads1 * this.weakRam;

          if (weakRamNeeded > hostMaxRam) {
            // too bad, do our best
            frame.weakThreads1 = Math.floor(hostMaxRam / this.weakRam);
          }

          // seems basically impossible, but just to be safe
          if (frame.weakThreads1 === 0) return undefined;

          // Duration read against the snapshot (real op-call state).
          frame.weakTime1 = this.ns.formulas.hacking.weakenTime(originalTarget, originalPlayer);

          // Sizing-state mutation only: drop server security toward min so the
          // next iteration knows how much weakening remains. No player XP
          // mutation — that drift was the source of the timing bug.
          applyWeak(this.ns, target, frame.weakThreads1, hostCores);
        }
        break;

      // This phase is all about bringing the server to max money while maintaining its minimum security level.
      // In this phase, frame.grow is applied, followed by frame.weak1.
      case "GW":
        {
          const split = tryFindGrowWeakSplit(
            this.ns,
            hostMaxRam,
            hostCores,
            originalPlayer,
            target,
          );
          if (!split) return undefined;

          frame.growThreads = split.growThreads;
          frame.weakThreads1 = split.weakThreads;

          // Durations against the snapshot. Note: in the W → GW transition,
          // `target` has been mutated down to min security by the simulated W
          // batches, but in reality those W weaks haven't resolved yet at the
          // GW grow's op-call time, so the real server security is still ~the
          // snapshot's. Reading against `originalTarget` matches reality.
          frame.growTime = this.ns.formulas.hacking.growTime(originalTarget, originalPlayer);
          frame.weakTime1 = this.ns.formulas.hacking.weakenTime(originalTarget, originalPlayer);

          // Sizing-state mutation: advance money via grow, and reset security
          // to min (weak1 is sized to undo grow's security bump).
          applyGrow(this.ns, target, originalPlayer, frame.growThreads, hostCores, true);
          // ASSUMPTION: server is back in min security state (no applyWeak)
          target.hackDifficulty = target.minDifficulty;
        }
        break;

      // Get rich. In this phase, frame.hack, frame.weak1, frame.grow, and
      // frame.weak2 all run as a single batch and the server is expected to
      // end at the same state it started (min security, max money).
      case "HWGW":
        {
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

          // ASSUMPTION: changing the server's moneyAvailable does NOT impact
          // grow time. The docs indicate this, but calling it out so anyone
          // reading is aware.
          // Durations against the snapshot. The HWGW batch is self-balancing
          // (the simulated `target` stays at min security / max money across
          // iterations), so for HWGW the snapshot and the mutated `target`
          // happen to agree on security/money; we still use the snapshot for
          // consistency with W/GW and to avoid future drift bugs.
          frame.hackTime = this.ns.formulas.hacking.hackTime(originalTarget, originalPlayer);
          frame.weakTime1 = this.ns.formulas.hacking.weakenTime(originalTarget, originalPlayer);
          frame.growTime = this.ns.formulas.hacking.growTime(originalTarget, originalPlayer);
          frame.weakTime2 = this.ns.formulas.hacking.weakenTime(originalTarget, originalPlayer);

          // Sizing-state mutation: the batch is self-balancing (weak1 undoes
          // hack's bump, weak2 undoes grow's bump, grow restores money), so
          // the next batch sees pristine state.
          // ASSUMPTION: server is back to max money and min security
          target.hackDifficulty = target.minDifficulty;
          target.moneyAvailable = target.moneyMax;
        }
        break;
    }

    return frame;
  }

  // Returns how much ram the batch frame actually uses
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
