import { NS } from "@ns";
import { BaseTask } from "./baseTask";
import { TaskId } from "./types";
import { Allocator, Lease } from "./allocator";

export interface TaskLease {
  lease: Lease;
  pids: number[];
}

export abstract class BaseSpawnerTask<
  TState extends Record<string, unknown> = Record<string, unknown>,
> extends BaseTask<TState> {
  protected readonly allocator: Allocator;

  constructor(ns: NS, taskId: TaskId, taskScriptPath: string) {
    super(ns, taskId);

    this.allocator = new Allocator(this.allocation.servers);
    const scriptRam = this.ns.getScriptRam(taskScriptPath, "home");

    if (scriptRam === 0) {
      this.log.error(`Trying to construct task referencing nonexistant script ${taskScriptPath}`);
    }

    // remove ourself from the allocation pool, since this script is running too
    this.allocator.reserve([
      {
        ram: scriptRam,
        hostname: this.state.host!,
      },
    ]);
  }

  // Runs a script and returns its pid (or undefined if unsuccessful).
  // when script run is unsuccessful, frees the lease from the allocator.
  // If threads are not specified, will attempt to use all available threads
  protected runScript(
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
  protected async waitAndFreeTaskLeases(
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

  protected teardown(log: boolean): void {
    const pids = this.state.childPids;
    for (const pid of pids) {
      if (this.ns.isRunning(pid)) this.ns.kill(pid);
    }

    if (log) this.log.info(`shutdown: killed ${pids.length} worker(s)`);
  }
}
