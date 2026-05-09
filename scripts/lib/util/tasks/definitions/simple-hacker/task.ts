import { NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { SIMPLE_HACKER_TASK_ID } from "./info";

const SIMPLE_SELF_HACK_SCRIPT = "lib/util/script/simple-self-hack.js";

class SimpleHackerTask extends BaseTask {
  constructor(ns: NS) {
    super(ns, SIMPLE_HACKER_TASK_ID);
  }

  protected async run_task(): Promise<void> {
    const simpleSelfHackRam = this.ns.getScriptRam(SIMPLE_SELF_HACK_SCRIPT, "home");

    if (simpleSelfHackRam === 0) {
      this.log.error("simple-self-hack scripts missing");
      return;
    }

    for (const slice of this.allocation.servers) {
      const pid = this.exec(SIMPLE_SELF_HACK_SCRIPT, slice.hostname, 1);
      if (pid === 0) {
        this.log.warn(`exec ${SIMPLE_SELF_HACK_SCRIPT} failed on ${slice.hostname}`);
        continue;
      }
      this.log.info(`started ${SIMPLE_SELF_HACK_SCRIPT} on ${slice.hostname}`);
    }

    while (true) {
      // script remains running only so it can be there to shutdown child PIDs
      if (this.shouldShutdown) {
        this.teardown();
        return;
      }

      await this.ns.asleep(10_000);
    }
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
  await new SimpleHackerTask(ns).start();
}
