import { NS } from "@ns";
import { BaseTask } from "./baseTask";
import { TaskDefinition } from "@repo/common/tasks/types";
import { Allocator, Lease } from "@repo/common/tasks/allocator";
import { getTaskScriptPath } from "./helpers";

export abstract class BaseSpawnerTask<TState = undefined> extends BaseTask<TState> {
  protected readonly allocator: Allocator;
  protected readonly childPids: number[];

  constructor(ns: NS, task: TaskDefinition) {
    super(ns, task);

    // tick so we get our task state populated
    this.tick();

    const taskScriptPath = getTaskScriptPath(task);
    this.childPids = [];
    this.allocator = new Allocator(this.management_state!.allocation!.servers);
    const scriptRam = this.ns.getScriptRam(taskScriptPath, "home");

    if (scriptRam === 0) {
      this.log.error(`Trying to construct task referencing nonexistant script ${taskScriptPath}`);
    }

    // remove ourself from the allocation pool, since this script is running too
    this.allocator.reserve([
      {
        ram: scriptRam,
        hostname: this.management_state!.host!,
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
        `Lease too small for ${scriptName} on ${lease.hostname}: got ${lease.ram.toFixed(2)} GB, need ≥${scriptRam} GB per thread. Returning lease.`,
        lease,
      );
      this.allocator.return(lease.leaseId);
      return undefined;
    }

    const pid = this.ns.exec(scriptName, lease.hostname, { threads: threads, temporary: true }, ...args);

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

  protected override shutdown(): void {
    const pids = this.childPids;
    for (const pid of pids) {
      this.ns.kill(pid);
    }
  }
}
