// --------------------------------------------------------------------------------
//  DashboardController is intended to capture all of the player's interactions with
//  the dashboard component. The dashboard is the top-level interactive component
//  of this system, and so all sub-states (task states, etc) will be children of
//  this dashboard state.
// --------------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { NS } from "@ns";
import { useNs } from "./ns";
import { TaskId } from "./tasks/types";
import { DASHBOARD_STATE_PORT } from "./ports";
import { DashboardController, DashboardState, ServerInfo } from "./dashboardTypes";
import { TaskManager } from "./tasks/taskManager";
import { useLogger } from "./logging/log";

// The interval that the entire dashboard system refreshes at. This controls
// sub-behaviors like task management/kickoff, etc.
const DEFAULT_INTERVAL_MS = 5_000;

// DFS-walks the network starting from `root`, returning servers in traversal
// order (parents always before their children). ns.scan is bidirectional —
// every neighbor lists the caller back — so a visited set is required to
// avoid infinite recursion.
function findAllServers(ns: NS, root: string = "home"): ServerInfo[] {
  const result: ServerInfo[] = [];
  const visited = new Set<string>();

  function dfs(
    host: string,
    parent: string | null,
    depth: number,
    rails: boolean[],
    isLastSibling: boolean,
  ): void {
    if (visited.has(host)) return;
    visited.add(host);
    const data = ns.getServer(host);
    result.push({
      ...data,
      parent,
      depth,
      rails: [...rails],
      isLastSibling,
    } as ServerInfo);

    const children = ns.scan(host).filter((n) => !visited.has(n));
    // Skip appending a rail entry when this node is root — root has no
    // siblings, so depth-1 children render with zero rail columns.
    const childRails = depth >= 1 ? [...rails, !isLastSibling] : rails;
    for (let i = 0; i < children.length; i++) {
      dfs(children[i], host, depth + 1, childRails, i === children.length - 1);
    }
  }

  dfs(root, null, 0, [], true);
  return result;
}

function snapshot(ns: NS): DashboardState {
  const raw = ns.peek(DASHBOARD_STATE_PORT);

  if (raw !== "NULL PORT DATA") {
    try {
      return JSON.parse(raw as string) as DashboardState;
    } catch {}
  }

  return {
    tick: 0,
    currentVersion: ns.read("version.txt").trim(),
    propagatedVersion: ns.read(".state/version.txt").trim(),
    allServers: findAllServers(ns, "home"),
    tasks: {},
  };
}

function publishSnapshot(ns: NS, snapshot: DashboardState) {
  ns.clearPort(DASHBOARD_STATE_PORT);
  ns.writePort(DASHBOARD_STATE_PORT, JSON.stringify(snapshot));
}

const DashboardControllerContext = createContext<DashboardController | null>(null);

export function DashboardControllerProvider({
  intervalMs = DEFAULT_INTERVAL_MS,
  children,
}: {
  intervalMs?: number;
  children: ReactNode;
}) {
  const ns = useNs();
  const taskManagerLogger = useLogger("task-manager");

  const [state, setState] = useState<DashboardState>(() => snapshot(ns));

  const taskManager = useMemo(
    () => new TaskManager(ns, taskManagerLogger),
    [ns, taskManagerLogger],
  );

  useEffect(() => {
    const id = setInterval(() => {
      const newState = snapshot(ns);
      newState.tasks = taskManager.runTick(newState); // note the tick wil be wrong, but we don't use it for task management

      setState((prev) => {
        newState.tick = prev.tick + 1;
        publishSnapshot(ns, newState);
        return newState;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [ns, intervalMs]);

  const startTask = useCallback(
    (taskId: TaskId) => {
      const newTaskState = taskManager.begin(taskId);

      if (newTaskState) {
        const newState = snapshot(ns);
        newState.tasks = newTaskState;
        newState.tick = state.tick;
        publishSnapshot(ns, newState);
      }
    },
    [taskManager, state],
  );

  const shutdownTask = useCallback(
    (taskId: TaskId) => {
      const newTaskState = taskManager.shutdown(taskId);

      if (newTaskState) {
        const newState = snapshot(ns);
        newState.tasks = newTaskState;
        newState.tick = state.tick; // no need to have a quick tick
        publishSnapshot(ns, newState);
      }

      taskManager.shutdown(taskId);
    },
    [taskManager, state],
  );

  const controller = useMemo(
    () =>
      ({
        state: state,
        startTask: startTask,
        shutdownTask: shutdownTask,
      }) satisfies DashboardController,
    [state, taskManager],
  );

  return (
    <DashboardControllerContext.Provider value={controller}>
      {children}
    </DashboardControllerContext.Provider>
  );
}

export function useDashboardController(): DashboardController {
  const v = useContext(DashboardControllerContext);
  if (!v) throw new Error("useDashboardController must be used inside <DashboardStateContext>");
  return v;
}
