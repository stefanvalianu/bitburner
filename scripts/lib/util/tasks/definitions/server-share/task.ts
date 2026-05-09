import { NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { SERVER_SHARE_TASK_ID } from "./info";

const SHARE_SCRIPT = "lib/util/script/share.js";

class ServerShareTask extends BaseTask {
  constructor(ns: NS) {
    super(ns, SERVER_SHARE_TASK_ID);
  }

  protected async run_task(): Promise<void> {
    const shareRam = this.ns.getScriptRam(SHARE_SCRIPT, "home");

    if (shareRam === 0) {
      this.log.error("share scripts missing");
      return;
    }

    for (const slice of this.allocation.servers) {
      const threads = Math.floor(slice.ram / shareRam);
      if (threads <= 0) continue;
      const pid = this.exec(SHARE_SCRIPT, slice.hostname, threads);
      if (pid === 0) {
        this.log.warn(`exec ${SHARE_SCRIPT} failed on ${slice.hostname} (threads=${threads})`);
        continue;
      }
      this.log.info(`started ${threads} ${SHARE_SCRIPT} threads from ${slice.hostname}`);
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
  await new ServerShareTask(ns).start();
}
