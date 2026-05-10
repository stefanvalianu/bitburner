import { NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { SERVER_DEVOURER_TASK_ID } from "./info";
import { Allocator, Lease } from "../../allocator";
import { ServerInfo } from "../../../dashboardTypes";

const HACK_SCRIPT = "lib/util/script/hack.js";

const THIS_SCRIPT = "lib/util/tasks/definitions/server-devourer/task.js";

interface TaskLease {
  lease: Lease;
  pids: number[];
}

class ServerDevourerTask extends BaseTask {
  private readonly allocator: Allocator;

  constructor(ns: NS) {
    super(ns, SERVER_DEVOURER_TASK_ID);

    this.allocator = new Allocator(this.allocation.servers);

    // remove ourself from the allocation pool, since this script is running too
    this.allocator.reserve([
      {
        ram: this.ns.getScriptRam(THIS_SCRIPT, "home"),
        hostname: this.state.host!,
      },
    ]);
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

    while ((lease = this.allocator.lease_up_to()) !== null) {
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

  // Runs a script and returns its pid (or undefined if unsuccessful).
  // when script run is unsuccessful, frees the lease from the allocator.
  // If threads are not specified, will attempt to use all available threads
  private runScript(
    scriptName: string,
    lease: Lease,
    target: string,
    threads?: number,
    additionalMsec?: number,
  ): number | undefined {
    threads = threads ?? Math.floor(lease.ram / this.ns.getScriptRam(scriptName));

    const pid = additionalMsec
      ? this.ns.exec(scriptName, lease.hostname, threads, target, additionalMsec)
      : this.ns.exec(scriptName, lease.hostname, threads, target);

    if (pid === 0) {
      this.log.error(`Failed to spawn script against ${lease.hostname}`);
      this.allocator.return(lease.leaseId);
      return undefined;
    }

    return pid;
  }

  // Waits the estimatedWait ms before checking that the task leases are done
  // If they're not, will wait a bit more before reporting an error and returning
  private async waitAndFreeTaskLeases(
    taskLeases: TaskLease[],
    estimatedWait: number,
  ): Promise<void> {
    await this.ns.asleep(estimatedWait);

    const maxRetries = 5;
    const retryDelayMs = 1_000;

    let remaining = [...taskLeases];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const stillRunning: TaskLease[] = [];

      for (const taskLease of taskLeases) {
        if (taskLease.pids.find((pid) => this.ns.isRunning(pid))) {
          stillRunning.push(taskLease);
        } else {
          this.allocator.return(taskLease.lease.leaseId);
        }
      }

      if (stillRunning.length === 0) {
        return;
      }

      this.log.warn(
        `${stillRunning.length} lease${stillRunning.length === 1 ? "" : "s"} still running. Waiting before retry ${attempt}/${maxRetries}.`,
      );

      remaining = stillRunning;
      await this.ns.sleep(retryDelayMs);
    }

    this.log.error(
      `${remaining.length} lease${remaining.length === 1 ? "" : "s"} still running after max retries. Next round will be missing resources.`,
    );
  }

  // Cooperative teardown — kill every worker we spawned.
  private teardown(log: boolean): void {
    const pids = this.state.childPids;
    for (const pid of pids) {
      if (this.ns.isRunning(pid)) this.ns.kill(pid);
    }

    if (log) this.log.info(`shutdown: killed ${pids.length} worker(s)`);
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new ServerDevourerTask(ns).start();
}
