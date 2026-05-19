import { NS } from "@ns";
import { SERVER_SHARE_TASK_ID } from "./info";
import { BaseSpawnerTask, TaskLease } from "../../baseSpawnerTask";
import { Lease } from "../../allocator";

const SHARE_SCRIPT = "lib/util/script/share.js";

class ServerShareTask extends BaseSpawnerTask {
  constructor(ns: NS) {
    super(ns, SERVER_SHARE_TASK_ID);
  }

  protected async run_task(): Promise<void> {
    const shareRam = this.ns.getScriptRam(SHARE_SCRIPT, "home");

    if (shareRam === 0) {
      this.log.error("share scripts missing");
      return;
    }

    let leases: Lease[] = [];
    let taskLeases: TaskLease[] = [];
    let lease: Lease | null = null;

    while ((lease = this.allocator.leaseUpTo()) !== null) {
      leases.push(lease);
    }

    // these scripts run indefinitely, so we'll need to stay vigilent for a shutdown script
    for (const availableLease of leases) {
      const pid = this.runScript(SHARE_SCRIPT, availableLease, undefined);
      if (pid) {
        taskLeases.push({
          lease: availableLease,
          pids: [pid],
        });
      }
    }

    while (true) {
      if (this.shouldShutdown) {
        this.teardown(true);
        return;
      }

      await this.ns.asleep(5_000);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new ServerShareTask(ns).start();
}
