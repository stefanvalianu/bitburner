import { ServerInfo } from "./serverMap";
import { TaskId, TaskState } from "./tasks/types";

export interface DashboardState {
  // simple incremental tick counter; can easily bind to control re-renders
  tick: number;

  // the dashboard is responsible for copying (scp) all scripts to all available
  // nodes at startup, to ensure that everything is available everywhere. These
  // fields are used to support this (copying only happens if a CHANGE) in the
  // scripts on `home` is detected.
  currentVersion: string;
  propagatedVersion: string;

  // the dashboard is responsible for maintaining the map of servers
  allServers: ServerInfo[];

  // For the most part, the 'brain' of this system is the task manager. This
  // collection is the summation of all outputs of the different tasks.
  tasks: Record<TaskId, TaskState>;

  // TODO - user preferences should be here, so player interacting with the
  // dashboard changes these preferences, and tasks can consume those preferences
}

export interface DashboardController {
  // Representative state for this tick
  state: DashboardState;

  // Command to gracefully shuts down a given taskId
  shutdownTask: (taskId: TaskId) => void;
}
