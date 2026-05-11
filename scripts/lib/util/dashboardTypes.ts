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

export interface DashboardPreferences {
  // Money the dashboard will refuse to spend below. Purchasing tasks consult
  // this threshold; 0 means "spend freely".
  reservedMoney: number;

  // Whether to auto-purchase servers using the server task.
  autobuyServers: boolean;

  // Whether to auto-purchase hacknet servers and their upgrades.
  autobuyHacknet: boolean;
}

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

  // True while a reallocation cycle is in progress: unbounded tasks have been
  // asked to shut down and the system is waiting to re-request them. New
  // task starts and manual shutdowns are blocked while this is set.
  reallocating: boolean;

  // User-tunable knobs. Sourced from the PreferencesContext at publish time;
  // consumed by tasks that need a player-facing setting (e.g. spend limits).
  preferences: DashboardPreferences;
}

export interface DashboardController {
  // Representative state for this tick
  state: DashboardState;

  // Command to start one or more new task(s) by taskId
  startTasks: (taskIds: TaskId[]) => void;

  // Command to gracefully shuts down a given taskId
  shutdownTask: (taskId: TaskId) => void;

  // True when the dashboard should offer a "Reallocate" action — i.e. there's
  // a starved unbounded task and enough RAM slack for redistribution to help.
  shouldShowReallocate: (state: DashboardState) => boolean;

  // Command to redistribute RAM across running tasks: requests shutdown of
  // unbounded tasks that aren't at their cap so they can be re-allocated
  // fresh once they've terminated.
  reallocate: () => void;
}

export const DEFAULT_PREFERENCES: DashboardPreferences = {
  reservedMoney: 0,
  autobuyServers: false,
  autobuyHacknet: false,
};
