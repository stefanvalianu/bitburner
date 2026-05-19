import { NS } from "@ns";
import {
  NOFORM_HACKER_TASK_ID,
  NoformHackerTaskState,
  Phase,
  ServerAnalysisReport,
  UserCommunicationRequest,
} from "./info";
import { performAnalysis } from "./profitAnalysis";
import { Lease } from "../../allocator";
import {
  findGrowWeakSplit,
  findHackWeakenGrowWeakenSplit,
  maxUsefulGrowWeakRam,
  maxUsefulHwgwRam,
  maxUsefulWeakenRam,
} from "./threadCalculations";
import { BaseSpawnerTask, TaskLease } from "../../baseSpawnerTask";
import { WEAKEN_SCRIPT, GROW_SCRIPT, HACK_SCRIPT } from "../../../script/constants";
import { getPortData, HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";

// number of miliseconds to aim for between batched operations
const BATCH_FRAME_OFFSET_MS = 50;

// For money and securtiy, how many checks in a row can be "Bad" before entering repair mode
const MAX_SEQUENTIAL_BAD_CHECKS = 3;

// re-run analysis every this many milliseconds
const ANALYSIS_MAX_STALENESS_MS = 60 * 1000; // 1 min

class NoformHackerTask extends BaseSpawnerTask<NoformHackerTaskState> {
  private phase: Phase;
  private target: string;
  private analysis: ServerAnalysisReport;

  // note it's not possible to have user select a target before running this script
  private userTarget?: string;

  constructor(ns: NS) {
    super(ns, NOFORM_HACKER_TASK_ID);

    this.phase = "hack";
    this.analysis = performAnalysis(this.ns, this.snapshot.allServers);
    this.target =
      this.analysis.analysis.length === 0 ? "n00dles" : this.analysis.analysis[0].hostname;
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
    if (this.analysis.analysis.length === 0) {
      this.log.error("Analysis returned no results");
      return;
    }

    this.target = this.analysis.analysis[0].hostname;
    this.patchTaskState();
    this.log.info(`Targetting ${this.target} for hacking.`);

    // this should start at max-1 so it repairs on first run if server is not good
    let badSecurityChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
    let badMoneyChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;

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
          this.userTarget = request.targetServers[0];
          this.target = this.userTarget;
        } else {
          // go back to best option
          this.userTarget = undefined;
          this.target = this.analysis.analysis[0].hostname;
        }

        this.log.info(`Targetting ${this.target} due to user request.`);

        // reset 'health' state
        badSecurityChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
        badMoneyChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
        this.phase = "hack";

        this.teardown();
        this.patchTaskState();
      }

      const targetMinSecurity = this.ns.getServerMinSecurityLevel(this.target);
      const targetAcceptableSecurity = targetMinSecurity * 1.05;
      const targetMaxMoney = this.ns.getServerMaxMoney(this.target);
      const targetAcceptableMoney = targetMaxMoney * 0.95;

      // occasionally, recalculate the optimal target to focus our efforts on
      if (Date.now() - this.analysis.ranAt >= ANALYSIS_MAX_STALENESS_MS) {
        this.analysis = performAnalysis(this.ns, this.snapshot.allServers);

        if (this.analysis.analysis.length === 0) {
          this.log.error("Analysis returned no results");
          this.teardown(true);
          return;
        }

        const newTarget = this.analysis.analysis[0].hostname;

        if (!this.userTarget && newTarget !== this.target) {
          this.log.info(`Priority target changed from ${this.target} to ${newTarget}`);
          badSecurityChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
          badMoneyChecks = MAX_SEQUENTIAL_BAD_CHECKS - 1;
          // kill child processes; TBD if we want to do this more gracefully (leaving money on table right now)
          // the thing is if we don't kill and enter repair right away, we're losing available resources on previous
          // scripts since repairs are essentially one-shots. potential to revisit TODO
          this.teardown();
          this.phase = "hack";
          this.target = newTarget;
        }

        this.patchTaskState();
      }

      // let's see if somehow the target is in a "BAD_SECURITY" state, meaning
      // that the security is too far away from minimum. Since this is a spot
      // check, we should add a threshold of 3-in-a-row bad-security checks
      // to enter "repair mode"
      const securityLevel = this.ns.getServerSecurityLevel(this.target);
      const securityBad = securityLevel > targetAcceptableSecurity;

      if (this.phase === "fix_security") {
        if (!securityBad) {
          this.log.info(`Target ${this.target} security fixed.`);
          this.phase = "hack";
          this.patchTaskState();
          badSecurityChecks = 0;
        }
      } else {
        if (securityBad) {
          badSecurityChecks++;

          if (badSecurityChecks >= MAX_SEQUENTIAL_BAD_CHECKS) {
            this.log.info(
              `Target ${this.target} security is too high ${securityLevel} / ${targetMinSecurity}, need to repair it.`,
            );
            this.phase = "fix_security";
            this.patchTaskState();
          }
        } else {
          badSecurityChecks = Math.max(0, badSecurityChecks - 1);
        }
      }

      if (this.phase === "fix_security") {
        await this.repairSecurity();
        continue;
      }

      // let's see if somehow the target is in a "BAD_MONEY" state, meaning
      // that the money is too far away from maximum.
      const moneyAvailable = this.ns.getServerMoneyAvailable(this.target);
      const moneyBad = moneyAvailable < targetAcceptableMoney;

      if (this.phase === "fix_money") {
        if (!moneyBad) {
          this.log.info(`Target ${this.target} money fixed.`);
          this.phase = "hack";
          this.patchTaskState();
          badMoneyChecks = 0;
        }
      } else {
        if (moneyBad) {
          badMoneyChecks++;

          if (badMoneyChecks >= MAX_SEQUENTIAL_BAD_CHECKS) {
            this.log.info(
              `Target ${this.target} money is too low ${moneyAvailable} / ${targetMaxMoney}, need to repair it.`,
            );
            this.phase = "fix_money";
            this.patchTaskState();
          }
        } else {
          badMoneyChecks = Math.max(0, badMoneyChecks - 1);
        }
      }

      if (this.phase === "fix_money") {
        await this.repairMoney();
        continue;
      }

      if (this.phase === "hack") {
        await this.hack();
        continue;
      }

      this.log.error(`Reached unexpected condition, state is ${this.phase}`);
      await this.ns.asleep(1000); // prevent infinite loops in error conditions lol
    }
  }

  private async repairSecurity(): Promise<void> {
    // Per current implementation (naively consuming our whole allocation)
    // for the job-at-hand, we're simply going to spam weaken on all our
    // resources and wait for them to finish
    const weakenRam = this.ns.getScriptRam(WEAKEN_SCRIPT);

    let leases: Lease[] = [];
    let taskLeases: TaskLease[] = [];

    while (true) {
      const top = this.allocator.peekTopHost();
      if (!top) break;
      const cap = maxUsefulWeakenRam(this.ns, this.target, weakenRam, top.cores);
      if (cap <= 0) break;
      const lease = this.allocator.leaseUpTo(cap);
      if (!lease) break;
      leases.push(lease);
    }

    // let's get an estimate of how long it would take to finish this batch of scripts, and make sure we wait that long
    const estimatedWaitTime = this.ns.getWeakenTime(this.target);

    for (const availableLease of leases) {
      const pid = this.runScript(WEAKEN_SCRIPT, availableLease, undefined, this.target);
      if (pid) {
        taskLeases.push({
          lease: availableLease,
          pids: [pid],
        });
      }
    }

    await this.waitAndFreeTaskLeases(taskLeases, estimatedWaitTime + BATCH_FRAME_OFFSET_MS, {
      forceKillOnExit: true,
      shouldExitEarly: () => this.ns.peek(HACKING_SYSTEM_COMMUNICATION_PORT) !== "NULL PORT DATA",
    });
  }

  private async repairMoney(): Promise<void> {
    // Per current implementation we'll consume our entire allocation to run
    // as many pairs of Grow/Weaken as we can.
    const weakenRam = this.ns.getScriptRam(WEAKEN_SCRIPT);
    const growRam = this.ns.getScriptRam(GROW_SCRIPT);

    if (weakenRam !== growRam) {
      this.log.error(`weaken script RAM (${weakenRam}) differs from grow script RAM (${growRam}).`);
    }

    let leases: Lease[] = [];
    let taskLeases: TaskLease[] = [];

    while (true) {
      const top = this.allocator.peekTopHost();
      if (!top) break;
      const cap = maxUsefulGrowWeakRam(this.ns, this.target, growRam, weakenRam, top.cores);
      if (cap <= 0) break;
      const lease = this.allocator.leaseUpTo(cap);
      if (!lease) break;
      leases.push(lease);
    }

    const weakTime = this.ns.getWeakenTime(this.target);
    const growTime = this.ns.getGrowTime(this.target);

    // First grow finish must be late enough that both grow and weaken can be delayed
    // to land at their desired finish times.
    let nextFinishTime =
      Math.max(growTime, weakTime - BATCH_FRAME_OFFSET_MS) + BATCH_FRAME_OFFSET_MS;
    let lastFinishTime = 0;

    for (const availableLease of leases) {
      // assumption: weakenRam === growRam
      const maxThreads = Math.floor(availableLease.ram / this.ns.getScriptRam(WEAKEN_SCRIPT));

      const growWeakSplit = findGrowWeakSplit(
        this.ns,
        maxThreads,
        this.target,
        availableLease.cores,
      );

      if (!growWeakSplit) {
        // Lease too small to fit ≥1 grow + ≥1 weaken. Skip — the RAM will
        // come back next round when (maybe) a larger lease is available.
        this.log.warn("Lease too small for grow/weak split; skipping.", availableLease);
        continue;
      }

      const targetGrowFinishTime = nextFinishTime;
      const targetWeakFinishTime = nextFinishTime + BATCH_FRAME_OFFSET_MS;

      const growDelay = Math.max(0, targetGrowFinishTime - growTime);
      const weakDelay = Math.max(0, targetWeakFinishTime - weakTime);

      const pidGrow = this.runScript(
        GROW_SCRIPT,
        availableLease,
        growWeakSplit.growThreads,
        this.target,
        growDelay,
      );

      if (!pidGrow) continue;

      const pidWeaken = this.runScript(
        WEAKEN_SCRIPT,
        availableLease,
        growWeakSplit.weakThreads,
        this.target,
        weakDelay,
      );

      if (!pidWeaken) continue;

      taskLeases.push({
        lease: availableLease,
        pids: [pidGrow, pidWeaken],
      });

      lastFinishTime = targetWeakFinishTime;

      // Reserve the next two landing slots:
      // current grow landed at T
      // current weaken landed at T + offset
      // next grow should land at T + 2 * offset
      nextFinishTime += 2 * BATCH_FRAME_OFFSET_MS;
    }

    await this.waitAndFreeTaskLeases(taskLeases, lastFinishTime + BATCH_FRAME_OFFSET_MS, {
      forceKillOnExit: true,
      shouldExitEarly: () => this.ns.peek(HACKING_SYSTEM_COMMUNICATION_PORT) !== "NULL PORT DATA",
    });
  }

  private async hack(): Promise<void> {
    const weakenRam = this.ns.getScriptRam(WEAKEN_SCRIPT);
    const growRam = this.ns.getScriptRam(GROW_SCRIPT);
    const hackRam = this.ns.getScriptRam(HACK_SCRIPT);

    const leases: Lease[] = [];
    const taskLeases: TaskLease[] = [];

    while (true) {
      const top = this.allocator.peekTopHost();
      if (!top) break;
      const cap = maxUsefulHwgwRam(this.ns, this.target, hackRam, weakenRam, growRam, top.cores);
      if (cap <= 0) break;
      const lease = this.allocator.leaseUpTo(cap);
      if (!lease) break;
      leases.push(lease);
    }

    const weakTime = this.ns.getWeakenTime(this.target);
    const growTime = this.ns.getGrowTime(this.target);
    const hackTime = this.ns.getHackTime(this.target);

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
        this.target,
        availableLease.cores,
        hackRam,
        weakenRam,
        growRam,
      );

      if (!split) {
        this.log.warn(
          "Could not find valid HWGW split for lease. (likely insufficient RAM)",
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
        split.hackThreads,
        this.target,
        hackDelay,
      );

      if (!pidHack) continue;

      const pidHackWeaken = this.runScript(
        WEAKEN_SCRIPT,
        availableLease,
        split.hackWeakenThreads,
        this.target,
        hackWeakenDelay,
      );

      if (!pidHackWeaken) continue;

      const pidGrow = this.runScript(
        GROW_SCRIPT,
        availableLease,
        split.growThreads,
        this.target,
        growDelay,
      );

      if (!pidGrow) continue;

      const pidGrowWeaken = this.runScript(
        WEAKEN_SCRIPT,
        availableLease,
        split.growWeakenThreads,
        this.target,
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

    await this.waitAndFreeTaskLeases(taskLeases, lastFinishTime + BATCH_FRAME_OFFSET_MS, {
      forceKillOnExit: true,
      shouldExitEarly: () => this.ns.peek(HACKING_SYSTEM_COMMUNICATION_PORT) !== "NULL PORT DATA",
    });
  }

  private patchTaskState(): void {
    this.patchState({
      currentTargets: [{ phase: this.phase, hostname: this.target }],
      targetReport: this.analysis,
      userTargets: this.userTarget ? [this.userTarget] : undefined,
    });
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new NoformHackerTask(ns).start();
}
