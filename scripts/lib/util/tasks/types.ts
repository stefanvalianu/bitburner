import type { NS } from "@ns";
import type { GameState } from "../gameState";
import { TASK_EVENTS_PORT, TASK_STATE_PORT } from "../ports";

// ---------------------------------------------------------------------------
// Identity & allocation
// ---------------------------------------------------------------------------

export type TaskId = string;

export interface ServerSlice {
  hostname: string;
  ram: number;
  cores: number;
}

export interface Allocation {
  taskId: TaskId;
  servers: ServerSlice[];
}

// ---------------------------------------------------------------------------
// Requirements (extensible — only growUnbounded today)
// ---------------------------------------------------------------------------

export interface TaskRequirements {
  // Task wants the entire worker fleet — spins off as many workers as the
  // available RAM lets it. The manager grants this to at most one task per
  // tick (see manager.tsx).
  growUnbounded?: boolean;
}

// ---------------------------------------------------------------------------
// Task state — base fields are manager-owned; per-task fields extend them.
// ---------------------------------------------------------------------------

export type TaskStatus = "idle" | "running" | "stopping";

export interface BaseTaskState {
  pid: number | null;
  host: string | null;
  childPids: number[];
  shutdownRequested: boolean;
  status: TaskStatus;
  // Last allocation handed to the controller — kept in the slot so the UI
  // can render hosts/RAM stats without coupling to manager internals.
  lastAllocation: Allocation | null;
}

export type TaskState<T = unknown> = BaseTaskState & T;

export type TaskStateSnapshot = Record<TaskId, TaskState>;

// Keys of BaseTaskState — used by the manager when shallow-merging
// state-patch events to reject attempts to overwrite manager-owned fields.
export const BASE_STATE_KEYS: ReadonlySet<string> = new Set([
  "pid",
  "host",
  "childPids",
  "shutdownRequested",
  "status",
  "lastAllocation",
]);

// ---------------------------------------------------------------------------
// Events: tasks → manager (FIFO on TASK_EVENTS_PORT)
// ---------------------------------------------------------------------------

export type TaskEvent =
  | { type: "state-patch"; taskId: TaskId; patch: Record<string, unknown> }
  | { type: "child-spawned"; taskId: TaskId; pid: number; hostname: string };

// ---------------------------------------------------------------------------
// Task definition
// ---------------------------------------------------------------------------

export interface TaskDefinition<TState extends Record<string, unknown> = Record<string, unknown>> {
  id: TaskId;
  scriptPath: string;
  requirements: TaskRequirements;
  // Initial task-specific fields when the manager first instantiates the slot.
  initialState: TState;
  // Pure: should this task be running fresh given the current conditions?
  // Answers both "should start" (when status === idle) and "should restart"
  // (when status === running — manager flips shutdownRequested and waits for
  // graceful exit). Returning false while idle keeps the task idle; returning
  // false while running leaves it running.
  needsRerun: (gameState: GameState, taskState: TaskState<TState>) => boolean;
}

// ---------------------------------------------------------------------------
// Port I/O
// ---------------------------------------------------------------------------

export function writeTaskState(ns: NS, snapshot: TaskStateSnapshot): void {
  ns.clearPort(TASK_STATE_PORT);
  ns.writePort(TASK_STATE_PORT, JSON.stringify(snapshot));
}

export function peekTaskState(ns: NS): TaskStateSnapshot | null {
  const raw = ns.peek(TASK_STATE_PORT);
  if (raw === "NULL PORT DATA") return null;
  try {
    return JSON.parse(raw as string) as TaskStateSnapshot;
  } catch {
    return null;
  }
}

export function emitEvent(ns: NS, event: TaskEvent): void {
  ns.getPortHandle(TASK_EVENTS_PORT).write(JSON.stringify(event));
}

export function drainEvents(ns: NS): TaskEvent[] {
  const port = ns.getPortHandle(TASK_EVENTS_PORT);
  const out: TaskEvent[] = [];
  while (!port.empty()) {
    const raw = port.read();
    if (typeof raw !== "string") continue;
    try {
      const parsed = JSON.parse(raw) as TaskEvent;
      if (parsed && typeof parsed === "object" && "type" in parsed) out.push(parsed);
    } catch {
      // ignore malformed payloads
    }
  }
  return out;
}
