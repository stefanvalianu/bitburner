import type { NS } from "@ns";
import { createLogger, type Logger } from "../log";
import { TASK_EVENTS_PORT, TASK_STATE_PORT } from "../ports";
import type { Allocation, TaskEvent, TaskId, TaskState, TaskStateSnapshot } from "./types";

// ---------------------------------------------------------------------------
// BaseTask
//
// Every task script subclasses this and implements `run()`. The base class
// owns:
//   • Bootstrap handshake — block until the manager publishes a snapshot
//     where this script's PID is the owner of the slot. This guarantees we
//     read OUR allocation, not a stale one from a previous run.
//   • Peek-based accessors (`state`, `allocation`, `snapshot`) — every read
//     re-peeks `TASK_STATE_PORT` so subclasses always see the latest values.
//   • Mutation helpers (`patchState`, `exec`) — writes go through the
//     manager's event channel; `exec` also auto-reports the spawned PID.
//   • Cooperative shutdown (`shouldShutdown`, `sleep`) — `sleep` returns
//     early and reports `true` if the manager flips `shutdownRequested`.
//
// Subclasses MUST define a TASK_ID constant in their own module and pass it
// to `super()` — the constant is the script's contract with the manager and
// must match the `id` in `definitions.ts`.
// ---------------------------------------------------------------------------

export abstract class BaseTask<TState extends Record<string, unknown> = Record<string, unknown>> {
  protected readonly ns: NS;
  protected readonly taskId: TaskId;
  protected readonly log: Logger;

  constructor(ns: NS, taskId: TaskId) {
    this.ns = ns;
    this.taskId = taskId;
    this.log = createLogger(ns, taskId);
  }

  // Entrypoint. Bootstrap, run the subclass body, and surface any error.
  async start(): Promise<void> {
    try {
      await this.run();
    } catch (e) {
      this.log.error(`task crashed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }

  // Subclasses implement their behavior here. They have access to all the
  // protected accessors below.
  protected abstract run(): Promise<void>;

  // -------------------------------------------------------------------------
  // Accessors — every read re-peeks the port. Cheap; tasks should treat
  // these as fresh on every call.
  // -------------------------------------------------------------------------

  // Our slot in the latest published snapshot. Throws if the snapshot or
  // slot is missing, which can only happen if the manager stopped publishing
  // — at that point the task is operating on stale assumptions and should
  // bail.
  protected get state(): TaskState<TState> {
    const slot = this.peekSlot();
    if (!slot) {
      throw new Error(`task-state slot for "${this.taskId}" missing from published snapshot`);
    }
    return slot;
  }

  // Worker allocation the manager assigned to this run. Always present
  // (the manager guarantees it before publishing the spawn).
  protected get allocation(): Allocation {
    return this.state.lastAllocation ?? { taskId: this.taskId, servers: [] };
  }

  // Full task-state snapshot. Useful for cross-task reads (e.g. hack reading
  // scout's published target).
  protected get snapshot(): TaskStateSnapshot {
    const raw = this.ns.peek(TASK_STATE_PORT);
    if (raw === "NULL PORT DATA") return {};
    try {
      return JSON.parse(raw as string) as TaskStateSnapshot;
    } catch {
      return {};
    }
  }

  // True iff the manager has flagged us for shutdown. Subclasses should
  // poll this (or use `sleep`) at every reasonable yield point.
  protected get shouldShutdown(): boolean {
    return this.state.shutdownRequested === true;
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

  // Sleep up to `ms`, polling for shutdown every POLL_MS-ish interval.
  // Returns true if shutdown was requested at any point during the sleep.
  protected async sleep(ms: number): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.shouldShutdown) return true;
      const remaining = end - Date.now();
      await this.ns.asleep(Math.min(2_000, remaining));
    }
    return this.shouldShutdown;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private peekSlot(): TaskState<TState> | null {
    const snap = this.snapshot;
    if (!snap) return null;
    const slot = snap[this.taskId];
    return (slot as TaskState<TState>) ?? null;
  }

  private emitEvent(event: TaskEvent): void {
    this.ns.getPortHandle(TASK_EVENTS_PORT).write(JSON.stringify(event));
  }
}
