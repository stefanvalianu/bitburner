import { DashboardState } from "../dashboardTypes";

export type TaskId = string;

export interface ServerSlice {
  hostname: string;
  ram: number;

  // this is merely shorthand for the number of cores on the target server, it's not an "allotment"
  cores?: number;
}

export interface Allocation {
  taskId: TaskId;
  servers: ServerSlice[];
}

export type TaskPriority = "critical" | "normal";

export interface TaskDemand {
  // RAM the controller (entrypoint) script needs. Resolved by TaskManager at
  // allocation time via ns.getScriptRam - task definitions don't set this.
  entrypointRam: number;

  // Priority class for placement ordering.
  priority: TaskPriority;

  // Unbounded tasks ask for additional RAM beyond the entrypoint to spawn
  // child workers.
  unbounded?: boolean;

  // Cap on TOTAL allocation (including entrypoint). Only meaningful when
  // `unbounded` is true.
  maxRamDemand?: number;

  // Prefer hosts with more CPU cores when placing this task.
  prioritizeCores?: boolean;
}

// What a TaskDefinition declares - the resource ask without entrypointRam,
// which TaskManager fills in at allocation time.
export type DemandSpec = Omit<TaskDemand, "entrypointRam">;

export type TaskStatus = "requested" | "running" | "stopping";

export interface BaseTaskState {
  pid: number | null;
  host: string | null;
  shutdownRequested: boolean;
  status: TaskStatus;
  allocation: Allocation | null;
}

export type TaskState<T extends Record<string, unknown> = Record<string, unknown>> = BaseTaskState &
  T;

// Keys of BaseTaskState - used by the manager when shallow-merging
// state-patch events to reject attempts to overwrite manager-owned fields.
export const BASE_STATE_KEYS: ReadonlySet<string> = new Set([
  "pid",
  "host",
  "shutdownRequested",
  "status",
  "allocation",
]);

export type TaskEvent = { type: "state-patch"; taskId: TaskId; patch: Record<string, unknown> };

// Note the script path of a task is assumed to be "lib/util/tasks/definitions/{id}/task.js"
export interface TaskDefinition {
  id: TaskId;
  demand: DemandSpec;
  icon?: string;
  description: string;

  category: "general" | "hacking";

  // Whether the manager should always try to keep this task running.
  // Lifecycle concern, not a resource ask - distinct from `demand`.
  autostart?: boolean;

  // Optional shared netscript port. Two tasks declaring the same port are
  // mutually exclusive — TaskPanel blocks starting one while another with
  // the same port is already running.
  communicationPort?: number;

  // Optional function to check requirements for this task to be ran.
  // Useful for doing things like checking for Formulas.exe, etc
  checkRequirements?: (state: DashboardState) => boolean;
}
