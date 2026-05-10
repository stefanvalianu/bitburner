import { NS } from "@ns";
import { BaseTask } from "./baseTask";
import { TaskId } from "./types";
import { Allocator, Lease } from "./allocator";

export interface TaskLease {
  lease: Lease;
  pids: number[];
}

export interface WaitAndFreeTaskLeaseOptions {
  pollIntervalMs?: number;
  extraBufferMs?: number;
  shouldExitEarly?: () => boolean;

  // if true, pids and leases will be killed/renewed
  // when exiting function, regardless of their
  // completion
  forceKillOnExit?: boolean;
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

  /*
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
  }*/
  // Waits up to estimatedWait + extraBufferMs, checking periodically.
  // Frees each task lease as soon as all of its pids are done.
  // Returns early if all leases finish, or if shouldExitEarly returns true.
  protected async waitAndFreeTaskLeases(
    taskLeases: TaskLease[],
    estimatedWait: number,
    options: WaitAndFreeTaskLeaseOptions = {},
  ): Promise<void> {
    const pollIntervalMs = options.pollIntervalMs ?? 2_000;
    const extraBufferMs = options.extraBufferMs ?? 5_000;
    const shouldExitEarly = options.shouldExitEarly ?? (() => false);
    const forceKill = options.forceKillOnExit ?? false;

    const deadline = Date.now() + estimatedWait + extraBufferMs;

    let remaining = [...taskLeases];

    while (remaining.length > 0 && Date.now() < deadline) {
      if (shouldExitEarly()) {
        this.log.info("Exiting wait early");

        if (forceKill) {
          taskLeases.forEach((lease) => {
            lease.pids.forEach((pid) => this.ns.kill(pid));
            this.allocator.return(lease.lease.leaseId);
          });
        }

        return;
      }

      const stillRunning: TaskLease[] = [];

      for (const taskLease of remaining) {
        const isStillRunning = taskLease.pids.some((pid) => this.ns.isRunning(pid));

        if (isStillRunning) {
          stillRunning.push(taskLease);
        } else {
          this.allocator.return(taskLease.lease.leaseId);
        }
      }

      remaining = stillRunning;

      if (remaining.length === 0) {
        return;
      }

      const remainingWaitMs = deadline - Date.now();

      if (remainingWaitMs <= 0) {
        break;
      }

      await this.ns.asleep(Math.min(pollIntervalMs, remainingWaitMs));
    }

    if (remaining.length > 0) {
      if (forceKill) {
        taskLeases.forEach((lease) => {
          lease.pids.forEach((pid) => this.ns.kill(pid));
          this.allocator.return(lease.lease.leaseId);
        });
        this.log.warn(`Forcefully ended ${remaining.length} leases and their process ids`);
      } else {
        this.log.error(
          `${remaining.length} lease${remaining.length === 1 ? "" : "s"} still running after wait deadline. Next round will be missing resources.`,
        );
      }
    }
  }

  protected teardown(log: boolean): void {
    const pids = this.state.childPids;
    for (const pid of pids) {
      if (this.ns.isRunning(pid)) this.ns.kill(pid);
    }

    if (log) this.log.info(`shutdown: killed ${pids.length} worker(s)`);
  }
}
