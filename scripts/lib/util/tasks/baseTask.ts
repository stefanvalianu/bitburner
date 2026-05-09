import type { NS } from "@ns";
import { createLogger, type Logger } from "../logging/log";
import { TASK_EVENTS_PORT, DASHBOARD_STATE_PORT } from "../ports";
import type { Allocation, TaskEvent, TaskId, TaskState } from "./types";
import { DashboardState } from "../dashboardTypes";

export abstract class BaseTask<TState extends Record<string, unknown> = Record<string, unknown>> {
  protected readonly ns: NS;
  protected readonly taskId: TaskId;
  protected readonly log: Logger;

  constructor(ns: NS, taskId: TaskId) {
    this.ns = ns;
    this.taskId = taskId;
    this.log = createLogger(ns, taskId);
  }

  // Entrypoint. Run the subclass body and surface any error.
  async start(): Promise<void> {
    try {
      await this.run_task();
    } catch (e) {
      this.log.error(`task crashed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally {
      // when a task exits, we should kill all children (lol comments)
      const pids = this.state?.childPids;
      if (pids.length > 0) {
        for (const pid of pids) {
          if (this.ns.isRunning(pid)) this.ns.kill(pid);
        }
        this.log.info(`shutdown: killed ${pids.length} worker(s)`);
      }
    }
  }

  // Subclasses implement their behavior here. They have access to all the
  // protected accessors below. Avoiding name `run` since that adds RAM cost lol
  protected abstract run_task(): Promise<void>;

  // -------------------------------------------------------------------------
  // Accessors — every read re-peeks the port. Cheap; tasks should treat
  // these as fresh on every call.
  // -------------------------------------------------------------------------

  // Helper for reading our specific task state from the overall snapshot
  protected get state(): TaskState<TState> {
    const slot = this.snapshot.tasks[this.taskId];
    return (slot as TaskState<TState>) ?? null;
  }

  // Worker allocation the manager assigned to this run. Always present
  // (the manager guarantees it before publishing the spawn).
  protected get allocation(): Allocation {
    return this.state.allocation ?? { taskId: this.taskId, servers: [] };
  }

  // Full task-state snapshot. Useful for cross-task reads (e.g. hack reading
  // scout's published target).
  protected get snapshot(): DashboardState {
    const raw = this.ns.peek(DASHBOARD_STATE_PORT);
    if (raw === "NULL PORT DATA")
      return {
        allServers: [],
        tasks: {},
        tick: -1,
        currentVersion: "0",
        propagatedVersion: "0",
      };
    try {
      return JSON.parse(raw as string) as DashboardState;
    } catch {
      return {
        allServers: [],
        tasks: {},
        tick: -1,
        currentVersion: "0",
        propagatedVersion: "0",
      };
    }
  }

  // True iff the manager has flagged us for shutdown. Subclasses should
  // poll this (or use `sleep`) at every reasonable yield point.
  protected get shouldShutdown(): boolean {
    return this.state?.shutdownRequested === true || false;
  }

  // -------------------------------------------------------------------------
  // Mutations — go through the event port; the manager applies them on its
  // next tick.
  // -------------------------------------------------------------------------

  // Shallow-merge a partial state update into our slot. Base lifecycle
  // fields (pid/host/childPids/shutdownRequested/status/lastAllocation)
  // are silently rejected by the manager — those are manager-owned.
  protected patchState(patch: Partial<TState>): void {
    this.emitEvent({
      type: "state-patch",
      taskId: this.taskId,
      patch: patch as Record<string, unknown>,
    });
  }

  // Spawn a worker. Wraps ns.exec and auto-emits a child-spawned event so
  // the manager can track the worker for cleanup.
  protected exec(
    script: string,
    hostname: string,
    threads: number,
    ...args: (string | number | boolean)[]
  ): number {
    const pid = this.ns.exec(script, hostname, threads, ...args);
    if (pid !== 0) {
      this.emitEvent({ type: "child-spawned", taskId: this.taskId, pid, hostname });
    }
    return pid;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private emitEvent(event: TaskEvent): void {
    this.ns.getPortHandle(TASK_EVENTS_PORT).write(JSON.stringify(event));
  }
}
