import type { GameState } from "../gameState";

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

// idle = task has not yet began. running = task is currently running. stopping = task is waiting for its workers and will eventually terminate. finished = done
export type TaskStatus = "idle" | "running" | "stopping" | "finished";

export interface BaseTaskState {
  pid: number | null;
  host: string | null;
  childPids: number[];
  shutdownRequested: boolean;
  status: TaskStatus;
  // Last allocation handed to the controller — kept in the slot so the UI
  // can render hosts/RAM stats and so tasks can read their own allocation
  // from the published snapshot without being passed args.
  lastAllocation: Allocation | null;
}

export type TaskState<T extends Record<string, unknown> = Record<string, unknown>> = BaseTaskState &
  T;

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
//
// `needsRerun` receives:
//   - gameState: the latest NS-derived game snapshot
//   - taskState: this task's own slot in the manager's authoritative
//                snapshot
//   - snapshot:  the full authoritative snapshot, for cross-task reads
//                (e.g. hack reading scout's published target)
// ---------------------------------------------------------------------------

export interface TaskDefinition<TState extends Record<string, unknown> = Record<string, unknown>> {
  id: TaskId;
  scriptPath: string;
  requirements: TaskRequirements;
  initialState: TState;
  needsRerun: (
    gameState: GameState,
    taskState: TaskState<TState>,
    snapshot: TaskStateSnapshot,
  ) => boolean;
}
