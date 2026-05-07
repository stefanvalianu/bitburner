import type { NS } from "@ns";
import {
  emitEvent,
  peekTaskState,
  type Allocation,
  type TaskId,
  type TaskState,
  type TaskStateSnapshot,
} from "./types";

// ---------------------------------------------------------------------------
// Spawn args contract:
//   ns.exec(scriptPath, host, 1, taskId, allocationJson?)
// args[0] = taskId (string)
// args[1] = JSON-encoded Allocation (optional; controller-only tasks get
//          an empty allocation by convention)
// ---------------------------------------------------------------------------

export function readTaskId(ns: NS): TaskId {
  const raw = ns.args[0];
  if (typeof raw !== "string") {
    throw new Error(`task missing taskId arg (got ${typeof raw})`);
  }
  return raw;
}

export function readAllocation(ns: NS): Allocation {
  const raw = ns.args[1];
  if (typeof raw !== "string") {
    throw new Error(`task missing allocation arg (got ${typeof raw})`);
  }
  return JSON.parse(raw) as Allocation;
}

// ---------------------------------------------------------------------------
// Snapshot reads (peek; non-blocking).
// ---------------------------------------------------------------------------

export function peekSnapshot(ns: NS): TaskStateSnapshot | null {
  return peekTaskState(ns);
}

export function peekMyState<T = Record<string, unknown>>(ns: NS, id: TaskId): TaskState<T> | null {
  const snap = peekTaskState(ns);
  if (!snap) return null;
  const slot = snap[id];
  return (slot as TaskState<T>) ?? null;
}

// True iff our slot in the latest published snapshot has shutdownRequested
// set. Tasks should poll this on a short interval (~2s) and exit cleanly
// when it flips. Falsey if the port hasn't been published yet — treat
// "no snapshot" as "no shutdown".
export function isShutdownRequested(ns: NS, id: TaskId): boolean {
  const slot = peekMyState(ns, id);
  return slot?.shutdownRequested === true;
}

// ---------------------------------------------------------------------------
// Event emit (manager applies on its next tick).
// ---------------------------------------------------------------------------

// Shallow-merge a partial state update into our slot. Keys that overlap
// with BaseTaskState (pid/host/childPids/shutdownRequested/status/
// lastAllocation) are dropped by the manager — those are manager-owned.
export function patchState(ns: NS, id: TaskId, patch: Record<string, unknown>): void {
  emitEvent(ns, { type: "state-patch", taskId: id, patch });
}

// Announce a freshly spawned worker so the manager can clean it up on
// shutdown. Callers should invoke this after every successful ns.exec.
// pid === 0 (exec failure) is silently dropped.
export function reportChild(ns: NS, id: TaskId, pid: number, hostname: string): void {
  if (pid === 0) return;
  emitEvent(ns, { type: "child-spawned", taskId: id, pid, hostname });
}
