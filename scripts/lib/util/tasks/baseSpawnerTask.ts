import { NS } from "@ns";
import { BaseTask } from "./baseTask";
import { TaskId } from "./types";
import { Allocator, Lease } from "./allocator";
import { getTaskScriptPath } from "./taskManager";

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

export function getScriptPath(taskId: TaskId) { 
  return `lib/util/tasks/definitions/${taskId}/task.js`;
}

export abstract class BaseSpawnerTask<
  TState extends Record<string, unknown> = Record<string, unknown>,
> extends BaseTask<TState> {
  protected readonly allocator: Allocator;
  protected readonly childPids: number[];

  constructor(ns: NS, taskId: TaskId) {
    super(ns, taskId);

    const taskScriptPath = getScriptPath(taskId);
    this.childPids = [];
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
    threads?: number,
    ...args: (string | number | boolean)[]
  ): number | undefined {
    const scriptRam = this.ns.getScriptRam(scriptName);
    threads = threads ?? Math.floor(lease.ram / scriptRam);

    // `ns.exec` throws on `threads <= 0` rather than returning 0, so guard
    // explicitly. Hits when `leaseUpTo` hands back a sliver smaller than one
    // thread's worth of RAM (e.g. a 1 GB lease for a 1.75 GB-per-thread
    // weaken — common after fragmentation drains the pool down to remnants).
    if (threads <= 0) {
      this.log.warn(
        `Lease too small for ${scriptName} on ${lease.hostname}: got ${lease.ram} GB, need ≥${scriptRam} GB per thread. Returning lease.`,
        lease,
      );
      this.allocator.return(lease.leaseId);
      return undefined;
    }

    const pid = this.ns.exec(scriptName, lease.hostname, threads, ...args);

    if (pid === 0) {
      this.log.error(
        `Failed to spawn script ${scriptName} with ${threads ?? "?"} threads on ${lease.hostname}.`,
        lease,
      );
      this.allocator.return(lease.leaseId);
      return undefined;
    }

    return pid;
  }

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

  protected teardown(log?: boolean): void {
    const pids = this.childPids;
    for (const pid of pids) {
      if (this.ns.isRunning(pid)) this.ns.kill(pid);
    }

    if (log) this.log.info(`shutdown: killed ${pids.length} worker(s)`);
  }
}
