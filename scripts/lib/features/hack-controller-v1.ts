import { NS } from "@ns";
import { BaseTask } from "../util/tasks/baseTask";
import type { HackTaskState, ScoutTaskState } from "../util/tasks/definitions";
import type { TaskState } from "../util/tasks/types";

const TASK_ID = "hack-v1";

const WEAKEN_SCRIPT = "lib/util/hacks/weaken.js";
const HACK_SCRIPT = "lib/util/hacks/hack.js";
const GROW_SCRIPT = "lib/util/hacks/grow.js";

// Hack controller (v1). Runs a fleet-wide weaken loop until either the
// target is at minimum security or the manager flags a shutdown. HWGW
// orchestration is intentionally deferred — this v1 just validates the
// task lifecycle (allocation, child reporting, cooperative shutdown).
class HackTask extends BaseTask<HackTaskState> {
  constructor(ns: NS) {
    super(ns, TASK_ID);
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

    if (await this.prepareSecurity(target, weakenRam)) return; // shutdown

    // Idle until the manager flags shutdown. Real HWGW work goes here.
    while (true) {
      if (await this.sleep(60_000)) {
        this.teardown();
        return;
      }
    }
  }

  private resolveTarget(): string | null {
    const scoutSlot = this.snapshot["scout-server"] as TaskState<ScoutTaskState> | undefined;
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
      if (await this.sleep(batchTime)) {
        this.teardown();
        return true;
      }
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

  // Cooperative teardown — kill every worker we spawned. Manager tracks the
  // same PIDs via child-spawned events but our own slot's `childPids` is
  // the freshest view.
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
