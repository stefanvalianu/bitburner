export type TaskId = string;

export interface ServerSlice {
  hostname: string;
  ram: number;
}

export interface Allocation {
  taskId: TaskId;
  servers: ServerSlice[];
}

export interface TaskDemands {
  // unbounded tasks will try to consume maximum ram, up to some potential limit (optional)
  unbounded?: boolean;

  // unbounded tasks will only request up to this number, if specified. otherwise they want it all
  maxRamDemand?: number;

  // whether to always try and start this task, ensuring it's always running (if possible)
  autostart?: boolean;

  // the priority of the task.
  priority: TaskPriority;

  // whether the task wants to prioritize servers with high cores
  prioritizeCores?: boolean;
}

// idle = task is only reserving allocations, but not running yet. running = task is currently running. 
// stopping = task is waiting for its workers and will eventually terminate.
export type TaskStatus = "idle" | "running" | "stopping";

export type TaskPriority = "critical" | "normal";

export interface BaseTaskState {
  pid: number | null;
  host: string | null;
  childPids: number[];
  shutdownRequested: boolean;
  status: TaskStatus;
  allocation: Allocation | null;
}

export type TaskState<T extends Record<string, unknown> = Record<string, unknown>> = BaseTaskState &
  T;

// Keys of BaseTaskState — used by the manager when shallow-merging
// state-patch events to reject attempts to overwrite manager-owned fields.
export const BASE_STATE_KEYS: ReadonlySet<string> = new Set([
  "pid",
  "host",
  "childPids",
  "shutdownRequested",
  "status",
  "allocation",
]);

export type TaskEvent =
  | { type: "state-patch"; taskId: TaskId; patch: Record<string, unknown> }
  | { type: "child-spawned"; taskId: TaskId; pid: number; hostname: string };


// Note the script path of a task is assumed to be "lib/util/tasks/definitions/{id}/task.js"
export interface TaskDefinition {
  id: TaskId;
  demands: TaskDemands;
  description: string;
}
