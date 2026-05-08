import { NS } from "@ns";
import { BaseTask } from "../util/tasks/baseTask";
import type { HackTaskState, ScoutTaskState } from "../util/tasks/definitions";
import type { TaskState } from "../util/tasks/types";
import { HACK_V1_TASK_ID, SCOUT_SERVER_TASK_ID } from "../util/tasks/ids";

const WEAKEN_SCRIPT = "lib/util/script/weaken.js";
const HACK_SCRIPT = "lib/util/script/hack.js";
const GROW_SCRIPT = "lib/util/script/grow.js";

// Controls the time delta to attempt to fit between batches
const BATCH_OFFSET = 10;

class HackTask extends BaseTask<HackTaskState> {
  constructor(ns: NS) {
    super(ns, HACK_V1_TASK_ID);
  }

  protected async run(): Promise<void> {
    const target = this.resolveTarget();

    if (!target) {
      this.log.error("no scout target");
      return;
    }

    // Record the target this run was started against. Lets the manager's
    // evaluate detect when scout publishes a different target later.
    this.patchState({ target });

    const { hackRam, weakenRam, growRam } = this.scriptRamCosts();
    if (hackRam === 0 || weakenRam === 0 || growRam === 0) {
      this.log.error("hack/grow/weaken scripts missing");
      return;
    }

    // 1 - lower the security of the target to minimum
    if (await this.prepareSecurity(target, weakenRam)) return;

    // 2 - raise the available money of the target to maximum, preserving
    // the minimum security level.
    if (await this.prepareMoney(target, growRam, weakenRam)) return;

    // 3 - begin the endless HWGW loop
    this.log.warn("todo finish HWGW v1 implementation");
    return;
  }

  private resolveTarget(): string | null {
    const scoutSlot = this.snapshot.tasks[SCOUT_SERVER_TASK_ID] as
      | TaskState<ScoutTaskState>
      | undefined;
    return scoutSlot?.target ?? null;
  }

  private scriptRamCosts(): { hackRam: number; weakenRam: number; growRam: number } {
    return {
      hackRam: this.ns.getScriptRam(HACK_SCRIPT, "home"),
      weakenRam: this.ns.getScriptRam(WEAKEN_SCRIPT, "home"),
      growRam: this.ns.getScriptRam(GROW_SCRIPT, "home"),
    };
  }

  // Loop weakens until security is at minimum. Returns true if shutdown was
  // requested mid-loop (caller should bail).
  private async prepareSecurity(target: string, weakenRam: number): Promise<boolean> {
    if (this.ns.getServerSecurityLevel(target) <= this.ns.getServerMinSecurityLevel(target)) {
      return false;
    }

    this.log.info(`preparing ${target} by lowering security level...`);

    while (this.ns.getServerSecurityLevel(target) > this.ns.getServerMinSecurityLevel(target)) {
      if (this.shouldShutdown) {
        this.teardown();
        return true;
      }

      const batchTime = this.runWeakenBatch(target, weakenRam);
      await this.ns.asleep(batchTime);
    }
    this.log.info(`${target} prepared for growth.`);
    return false;
  }

  // Spawn one weaken pass across every allocated host. Returns the time in
  // ms the longest spawned weaken will take (with a 100ms buffer).
  private runWeakenBatch(target: string, weakenRam: number): number {
    const weakenTime = this.ns.getWeakenTime(target);

    for (const slice of this.allocation.servers) {
      const threads = Math.floor(slice.ram / weakenRam);
      if (threads <= 0) continue;
      const pid = this.exec(WEAKEN_SCRIPT, slice.hostname, threads, target);
      if (pid === 0) {
        this.log.warn(`exec ${WEAKEN_SCRIPT} failed on ${slice.hostname} (threads=${threads})`);
        continue;
      }
      this.log.info(`started ${threads} ${WEAKEN_SCRIPT} threads from ${slice.hostname}`);
    }
    return weakenTime + 100;
  }

  private async prepareMoney(target: string, growRam: number, weakenRam: number): Promise<boolean> {
    if (this.ns.getServerMoneyAvailable(target) <= this.ns.getServerMaxMoney(target)) {
      return false;
    }

    this.log.info(`preparing ${target} by raising available money...`);

    while (this.ns.getServerMoneyAvailable(target) < this.ns.getServerMaxMoney(target)) {
      if (this.shouldShutdown) {
        this.teardown();
        return true;
      }

      const batchTime = this.runGrowBatch(target, growRam, weakenRam);
      await this.ns.asleep(batchTime);
    }
    this.log.info(`${target} prepared for growth.`);
    return false;
  }

  // Spawn one pass of grow/weaken cycles, returning the time (with an buffer)
  // of how long it would take to finish this batch.
  private runGrowBatch(target: string, growRam: number, weakenRam: number): number {
    const growTime = this.ns.getGrowTime(target);
    const weakenTime = this.ns.getWeakenTime(target);

    return 100;
  }

  // Cooperative teardown — kill every worker we spawned.
  private teardown(): void {
    const pids = this.state.childPids;
    for (const pid of pids) {
      if (this.ns.isRunning(pid)) this.ns.kill(pid);
    }
    this.log.info(`shutdown: killed ${pids.length} worker(s)`);
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new HackTask(ns).start();
}
