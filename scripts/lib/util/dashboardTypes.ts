import { Server } from "@ns";
import { TaskId, TaskState } from "./tasks/types";

export type ServerInfo = Server & {
  parent: string | null;
  // DFS depth from home; intentionally overrides DarknetServerData.depth
  // (which represents an unrelated net-depth concept).
  depth: number;
  // Per-ancestor "draw vertical line" flags. Length = depth - 1 (covers
  // ancestors at depths 1..depth-1, since depth-0 root has no siblings to
  // thread through). rails[i] = true means an ancestor at depth i+1 has
  // later siblings, so a vertical guide line should pass through column i.
  rails: boolean[];
  // True if this node is the last child of its parent. The renderer uses
  // this to clip the leaf column's vertical line to the top half.
  isLastSibling: boolean;
};

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
