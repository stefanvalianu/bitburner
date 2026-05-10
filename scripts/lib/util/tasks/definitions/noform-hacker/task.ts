import { NS } from "@ns";
import { NOFORM_HACKER_TASK_ID, NoformHackerTaskState, UserCommunicationRequest } from "./info";
import { performAnalysis } from "./profitAnalysis";
import { Lease } from "../../allocator";
import { findGrowWeakSplit, findHackWeakenGrowWeakenSplit } from "./threadCalculations";
import { BaseSpawnerTask } from "../../baseSpawnerTask";
import { WEAKEN_SCRIPT, GROW_SCRIPT, HACK_SCRIPT } from "../../../script/constants";
import { getPortData, HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";

// number of miliseconds to aim for between batched operations
const BATCH_FRAME_OFFSET_MS = 50;

// For money and securtiy, how many checks in a row can be "Bad" before entering repair mode
const MAX_SEQUENTIAL_BAD_CHECKS = 3;

const THIS_SCRIPT = "lib/util/tasks/definitions/noform-hacker/task.js";

// re-run analysis every this many milliseconds
const ANALYSIS_MAX_STALENESS_MS = 10 * 60 * 1000; // 10 min

interface TaskLease {
  lease: Lease;
  pids: number[];
}

class NoformHackerTask extends BaseSpawnerTask<NoformHackerTaskState> {
  constructor(ns: NS) {
    super(ns, NOFORM_HACKER_TASK_ID, THIS_SCRIPT);
  }

  // This script works by computing "batches" and attempting to execute them
  // with millisecond precision across different hosts. It is also responsible
  // for building and maintaining an analysis of potential targets so that it
  // directs its attention to the most optimal server target
  // UPDATE:
  // This script actually works even less effectively as a starting point; it
  // essentially does multiple passes and uses all of its available allocation
  // each round. However, it does not intelligently schedule "between" rounds.
  // A round can end in either a full utilization of HWGW cycles, a full utilization
  // of weaken cycles (to fix security), or a combination of WG to fix money.
  // Once the available allocation of the script is used up, we wait until those
  // scripts finish before going to the next step. This is obviously less efficient
  // but much easier to implement right now :)
  protected async run_task(): Promise<void> {
    // first, let's get a thorough analysis of available targets to prioritize.
    // for now, we'll only do 1 target at a time. this can be expanded to prioritize
    // multiple targets depending on availability and batch frame length, but let's
    // start simple (and we might have formulas.exe by the time that's relevant)
    let analysis = performAnalysis(this.ns, this.snapshot.allServers);

    if (analysis.analysis.length === 0) {
      this.log.error("Analysis returned no results");
      return;
    }

    let target = analysis.analysis[0].hostname;
    this.patchState({
      currentTargets: [target],
      targetReport: analysis,
    });
    this.log.info(`Targetting ${target} for hacking.`);

    // note it's not possible to have user select a target before running this script
    let userTarget: string | undefined = undefined;

    // this should start at max-1 so it repairs on first run if server is not good
    let badSecurityChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
    let badMoneyChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
    let state: "working" | "fix_security" | "fix_money" = "working";

    while (true) {
      if (this.shouldShutdown) {
        this.teardown(true);
        return;
      }

      const request = getPortData<UserCommunicationRequest>(
        this.ns,
        HACKING_SYSTEM_COMMUNICATION_PORT,
        true,
      );

      if (request) {
        if (request.targetServers.length > 0) {
          // swap to user's target
          userTarget = request.targetServers[0];
          target = userTarget;
        } else {
          // go back to best option
          userTarget = undefined;
          target = analysis.analysis[0].hostname;
        }

        this.log.info(`Targetting ${target} due to user request.`);

        // reset 'health' state
        badSecurityChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
        badMoneyChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
        state = "working";

        this.teardown(false);
        this.patchState({
          currentTargets: [target],
          targetReport: analysis,
        });
      }

      const targetMinSecurity = this.ns.getServerMinSecurityLevel(target);
      const targetAcceptableSecurity = targetMinSecurity * 1.05;
      const targetMaxMoney = this.ns.getServerMaxMoney(target);
      const targetAcceptableMoney = targetMaxMoney * 0.95;

      // occasionally, recalculate the optimal target to focus our efforts on
      if (Date.now() - analysis.ranAt >= ANALYSIS_MAX_STALENESS_MS) {
        analysis = performAnalysis(this.ns, this.snapshot.allServers);

        if (analysis.analysis.length === 0) {
          this.log.error("Analysis returned no results");
          this.teardown(true);
          return;
        }

        const newTarget = analysis.analysis[0].hostname;

        if (!userTarget && newTarget !== target) {
          this.log.info(`Priority target changed from ${target} to ${newTarget}`);
          badSecurityChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
          badMoneyChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
          // kill child processes; TBD if we want to do this more gracefully (leaving money on table right now)
          // the thing is if we don't kill and enter repair right away, we're losing available resources on previous
          // scripts since repairs are essentially one-shots. potential to revisit TODO
          this.teardown(false);
          state = "working";
          target = newTarget;
        }

        this.patchState({
          currentTargets: [target],
          targetReport: analysis,
        });
      }

      // let's see if somehow the target is in a "BAD_SECURITY" state, meaning
      // that the security is too far away from minimum. Since this is a spot
      // check, we should add a threshold of 3-in-a-row bad-security checks
      // to enter "repair mode"
      const securityLevel = this.ns.getServerSecurityLevel(target);
      const securityBad = securityLevel > targetAcceptableSecurity;

      if (state === "fix_security") {
        if (!securityBad) {
          this.log.info(`Target ${target} security fixed.`);
          state = "working";
          badSecurityChecks = 0;
        }
      } else {
        if (securityBad) {
          badSecurityChecks++;

          if (badSecurityChecks >= MAX_SEQUENTIAL_BAD_CHECKS) {
            this.log.info(
              `Target ${target} security is too high ${securityLevel} / ${targetMinSecurity}, need to repair it.`,
            );
            state = "fix_security";
          }
        } else {
          badSecurityChecks = Math.max(0, badSecurityChecks - 1);
        }
      }

      if (state === "fix_security") {
        await this.repairSecurity(target);
        continue;
      }

      // let's see if somehow the target is in a "BAD_MONEY" state, meaning
      // that the money is too far away from maximum.
      const moneyAvailable = this.ns.getServerMoneyAvailable(target);
      const moneyBad = moneyAvailable < targetAcceptableMoney;

      if (state === "fix_money") {
        if (!moneyBad) {
          this.log.info(`Target ${target} money fixed.`);
          state = "working";
          badMoneyChecks = 0;
        }
      } else {
        if (moneyBad) {
          badMoneyChecks++;

          if (badMoneyChecks >= MAX_SEQUENTIAL_BAD_CHECKS) {
            this.log.info(
              `Target ${target} money is too low ${moneyAvailable} / ${targetMaxMoney}, need to repair it.`,
            );
            state = "fix_money";
          }
        } else {
          badMoneyChecks = Math.max(0, badMoneyChecks - 1);
        }
      }

      if (state === "fix_money") {
        await this.repairMoney(target);
        continue;
      }

      if (state === "working") {
        await this.hack(target);
        continue;
      }

      this.log.error(`Reached unexpected condition, state is ${state}`);
      await this.ns.asleep(1000); // prevent infinite loops in error conditions lol
    }
  }

  private async repairSecurity(target: string): Promise<void> {
    // Per current implementation (naively consuming our whole allocation)
    // for the job-at-hand, we're simply going to spam weaken on all our
    // resources and wait for them to finish
    let leases: Lease[] = [];
    let taskLeases: TaskLease[] = [];
    let lease: Lease | null = null;

    while ((lease = this.allocator.leaseUpTo()) !== null) {
      leases.push(lease);
    }

    // let's get an estimate of how long it would take to finish this batch of scripts, and make sure we wait that long
    const estimatedWaitTime = this.ns.getWeakenTime(target);

    for (const availableLease of leases) {
      const pid = this.runScript(WEAKEN_SCRIPT, availableLease, target);
      if (pid) {
        taskLeases.push({
          lease: availableLease,
          pids: [pid],
        });
      }
    }

    await this.waitAndFreeTaskLeases(
      taskLeases,
      estimatedWaitTime + BATCH_FRAME_OFFSET_MS,
      { 
        forceKillOnExit: true,
        shouldExitEarly: () => this.ns.peek(HACKING_SYSTEM_COMMUNICATION_PORT) !== "NULL PORT DATA"
      });
  }

  private async repairMoney(target: string): Promise<void> {
    // Per current implementation we'll consume our entire allocation to run
    // as many pairs of Grow/Weaken as we can.
    let leases: Lease[] = [];
    let taskLeases: TaskLease[] = [];
    let lease: Lease | null = null;

    while ((lease = this.allocator.leaseUpTo()) !== null) {
      leases.push(lease);
    }

    // let's get an estimate of how long it would take to finish this batch of scripts, and make sure we wait that long
    const weakTime = this.ns.getWeakenTime(target);
    const growTime = this.ns.getGrowTime(target);
    const estimatedWaitTime = weakTime + growTime + 2 * BATCH_FRAME_OFFSET_MS;

    const weakenRam = this.ns.getScriptRam(WEAKEN_SCRIPT);
    const growRam = this.ns.getScriptRam(GROW_SCRIPT);

    if (weakenRam !== growRam) {
      this.log.error(`weaken script RAM (${weakenRam}) differs from grow script RAM (${growRam}).`);
    }

    // First grow finish must be late enough that both grow and weaken can be delayed
    // to land at their desired finish times.
    let nextFinishTime =
      Math.max(growTime, weakTime - BATCH_FRAME_OFFSET_MS) + BATCH_FRAME_OFFSET_MS;

    for (const availableLease of leases) {
      // assumption: weakenRam === growRam
      const maxThreads = Math.floor(availableLease.ram / this.ns.getScriptRam(WEAKEN_SCRIPT));

      const growWeakSplit = findGrowWeakSplit(this.ns, maxThreads, target, availableLease.cores);

      const targetGrowFinishTime = nextFinishTime;
      const targetWeakFinishTime = nextFinishTime + BATCH_FRAME_OFFSET_MS;

      const growDelay = Math.max(0, targetGrowFinishTime - growTime);
      const weakDelay = Math.max(0, targetWeakFinishTime - weakTime);

      const pidGrow = this.runScript(
        GROW_SCRIPT,
        availableLease,
        target,
        growWeakSplit.growThreads,
        growDelay,
      );

      if (!pidGrow) continue;

      const pidWeaken = this.runScript(
        WEAKEN_SCRIPT,
        availableLease,
        target,
        growWeakSplit.weakThreads,
        weakDelay,
      );

      if (!pidWeaken) continue;

      taskLeases.push({
        lease: availableLease,
        pids: [pidGrow, pidWeaken],
      });

      // Reserve the next two landing slots:
      // current grow landed at T
      // current weaken landed at T + offset
      // next grow should land at T + 2 * offset
      nextFinishTime += 2 * BATCH_FRAME_OFFSET_MS;
    }

    await this.waitAndFreeTaskLeases(
      taskLeases,
      estimatedWaitTime + BATCH_FRAME_OFFSET_MS,
      { 
        forceKillOnExit: true,
        shouldExitEarly: () => this.ns.peek(HACKING_SYSTEM_COMMUNICATION_PORT) !== "NULL PORT DATA"
      });
  }

  private async hack(target: string): Promise<void> {
    const leases: Lease[] = [];
    const taskLeases: TaskLease[] = [];

    let lease: Lease | null = null;

    while ((lease = this.allocator.leaseUpTo()) !== null) {
      leases.push(lease);
    }

    const weakTime = this.ns.getWeakenTime(target);
    const growTime = this.ns.getGrowTime(target);
    const hackTime = this.ns.getHackTime(target);

    const weakenRam = this.ns.getScriptRam(WEAKEN_SCRIPT);
    const growRam = this.ns.getScriptRam(GROW_SCRIPT);
    const hackRam = this.ns.getScriptRam(HACK_SCRIPT);

    let nextFinishTime =
      Math.max(
        hackTime,
        weakTime - BATCH_FRAME_OFFSET_MS,
        growTime - 2 * BATCH_FRAME_OFFSET_MS,
        weakTime - 3 * BATCH_FRAME_OFFSET_MS,
      ) + BATCH_FRAME_OFFSET_MS;

    let lastFinishTime = 0;

    for (const availableLease of leases) {
      const split = findHackWeakenGrowWeakenSplit(
        this.ns,
        availableLease.ram,
        target,
        availableLease.cores,
        hackRam,
        weakenRam,
        growRam,
      );

      if (!split) {
        this.log.warn(
          `Could not find valid HWGW split for lease. (likely insufficient RAM) ${availableLease.ram}`,
          availableLease,
        );
        continue;
      }

      const targetHackFinishTime = nextFinishTime;
      const targetHackWeakenFinishTime = nextFinishTime + BATCH_FRAME_OFFSET_MS;
      const targetGrowFinishTime = nextFinishTime + 2 * BATCH_FRAME_OFFSET_MS;
      const targetGrowWeakenFinishTime = nextFinishTime + 3 * BATCH_FRAME_OFFSET_MS;

      const hackDelay = Math.max(0, targetHackFinishTime - hackTime);
      const hackWeakenDelay = Math.max(0, targetHackWeakenFinishTime - weakTime);
      const growDelay = Math.max(0, targetGrowFinishTime - growTime);
      const growWeakenDelay = Math.max(0, targetGrowWeakenFinishTime - weakTime);

      const pidHack = this.runScript(
        HACK_SCRIPT,
        availableLease,
        target,
        split.hackThreads,
        hackDelay,
      );

      if (!pidHack) continue;

      const pidHackWeaken = this.runScript(
        WEAKEN_SCRIPT,
        availableLease,
        target,
        split.hackWeakenThreads,
        hackWeakenDelay,
      );

      if (!pidHackWeaken) continue;

      const pidGrow = this.runScript(
        GROW_SCRIPT,
        availableLease,
        target,
        split.growThreads,
        growDelay,
      );

      if (!pidGrow) continue;

      const pidGrowWeaken = this.runScript(
        WEAKEN_SCRIPT,
        availableLease,
        target,
        split.growWeakenThreads,
        growWeakenDelay,
      );

      if (!pidGrowWeaken) continue;

      taskLeases.push({
        lease: availableLease,
        pids: [pidHack, pidHackWeaken, pidGrow, pidGrowWeaken],
      });

      lastFinishTime = targetGrowWeakenFinishTime;

      // Reserve four landing slots:
      // hack, weaken-for-hack, grow, weaken-for-grow
      nextFinishTime += 4 * BATCH_FRAME_OFFSET_MS;
    }

    await this.waitAndFreeTaskLeases(
      taskLeases, 
      lastFinishTime + BATCH_FRAME_OFFSET_MS,
      { 
        forceKillOnExit: true,
        shouldExitEarly: () => this.ns.peek(HACKING_SYSTEM_COMMUNICATION_PORT) !== "NULL PORT DATA"
      });
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new NoformHackerTask(ns).start();
}
