import { NS } from "@ns";
import { SERVER_DEVOURER_TASK_ID } from "./info";
import { Lease } from "../../allocator";
import { ServerInfo } from "../../../dashboardTypes";
import { BaseSpawnerTask, TaskLease } from "../../baseSpawnerTask";
import { HACK_SCRIPT } from "../../../script/constants";

const THIS_SCRIPT = "lib/util/tasks/definitions/server-devourer/task.js";

class ServerDevourerTask extends BaseSpawnerTask {
  constructor(ns: NS) {
    super(ns, SERVER_DEVOURER_TASK_ID, THIS_SCRIPT);
  }

  protected async run_task(): Promise<void> {
    let servers = this.getServers();

    while (servers.length !== 0) {
      for (const target of servers) {
        if (this.shouldShutdown) {
          this.teardown(true);
          return;
        }

        const previousMoney = this.ns.getServerMoneyAvailable(target.hostname);
        await this.devour(target.hostname);
        this.log.info(
          `Devoured $${Math.floor(previousMoney - this.ns.getServerMoneyAvailable(target.hostname))} from ${target.hostname}.`,
        );
      }

      servers = this.getServers();
    }

    this.log.info("Ran out of servers worth devouring");
  }

  private getServers(): ServerInfo[] {
    return this.snapshot.allServers.filter(
      (s) =>
        s.hasAdminRights &&
        !s.purchasedByPlayer &&
        s.moneyAvailable &&
        s.moneyAvailable > 0 &&
        s.moneyMax &&
        (s.moneyAvailable / s.moneyMax > 0.03 || s.moneyAvailable > 2000000),
    );
  }

  private async devour(target: string): Promise<void> {
    let leases: Lease[] = [];
    let taskLeases: TaskLease[] = [];
    let lease: Lease | null = null;

    while ((lease = this.allocator.leaseUpTo()) !== null) {
      leases.push(lease);
      // this.log.info("Leased", lease);
    }

    // let's get an estimate of how long it would take to finish this batch of scripts, and make sure we wait that long
    const estimatedWaitTime = this.ns.getHackTime(target);

    for (const availableLease of leases) {
      const pid = this.runScript(HACK_SCRIPT, availableLease, target);
      if (pid) {
        taskLeases.push({
          lease: availableLease,
          pids: [pid],
        });
      }
    }

    await this.waitAndFreeTaskLeases(taskLeases, estimatedWaitTime + 100);
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new ServerDevourerTask(ns).start();
}
