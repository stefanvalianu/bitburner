import { Lease } from "./allocator";
import { NS } from "@ns";

export type TaskId = string;

export interface ServerSlice {
  hostname: string;
  ram: number;

  cores?: number;
}

export interface Allocation {
  taskId: TaskId;
  servers: ServerSlice[];
  totalRam: number;
}

export type TaskPriority = "critical" | "normal";

export interface TaskDemand {
  // RAM the controller (entrypoint) script needs. Resolved by TaskManager at
  // allocation time via ns.getScriptRam - task definitions don't set this.
  entrypointRam: number;

  // A few scripts which want to heavily optimize ram usage can chain scripts
  // one after the other with ns.spawn(). Those scripts can use this additional
  // headroom list so the allocator requests the necessary RAM to account for
  // the maximal RAM usage of the union. EX if you want to run a controller
  // script that runs a sub-script which spawns other scripts in a chain like
  // A->B->C, including those scripts in this list will make the allocator ensure
  // there is enough RAM for the controller + maxRam(A,B,C)
  additionalHeadroomSubscripts?: string[];

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

export interface TaskState {
  id: TaskId;
  pid: number | null;
  host: string | null;
  shutdownRequested: boolean;
  status: TaskStatus;
  allocation: Allocation | null;
}

// Keys of BaseTaskState - used by the manager when shallow-merging
// state-patch events to reject attempts to overwrite manager-owned fields.
export const BASE_STATE_KEYS: ReadonlySet<string> = new Set([
  "pid",
  "host",
  "shutdownRequested",
  "status",
  "allocation",
]);

export type TaskEvent = {
  taskId: TaskId; 
  type: "shutdown" | "request-start";  
};

// Note the script path of a task is assumed to be "lib/util/tasks/definitions/{id}/task.js"
export interface TaskDefinition {
  id: TaskId;
  demand: DemandSpec;
  icon: string;
  description: string;

  // Whether the manager should always try to keep this task running.
  // Lifecycle concern, not a resource ask - distinct from `demand`.
  autostart?: boolean;

  /*
    Tasks which want to take requests from a user should list a request
    port from which "command" requests will be read. Tasks sharing a 
    request port cannot be concurrently ran (enforced via launcher).
  */
  requestPort?: number;

  /*
    Each task can have its own dedicated port for state output. Tasks which share
    an output port cannot be concurrently ran (enforced via launcher).
  */
  statePort?: number;

  /*
    Optional function to check requirements for this task to be ran.
    Be wary of what netscript functions you use in the checker, since this
    this function is called from the main.js thread.
  */ 
  checkRequirements?: (ns: NS) => string | undefined;
}

/*
  Represents the state allotment snapshot published to the 
  TASK_STATE_PORT
*/
export interface TaskManagerState {
  tasks: Map<TaskId, TaskState>;
}

export interface TaskLease {
  lease: Lease;
  pids: number[];
}

export interface WaitAndFreeTaskLeaseOptions {
  pollIntervalMs?: number;
  extraBufferMs?: number;

  // Instead of waiting for a fixed amount of time,
  // waits until the lease tasks are completed.
  // DO NOT USE THIS if your tasks themselves run
  // forever (like the share() tasks)
  waitAsLongAsNeeded?: boolean;

  shouldExitEarly?: () => boolean;

  // if true, pids and leases will be killed/renewed
  // when exiting function, regardless of their
  // completion
  forceKillOnExit?: boolean;
}
