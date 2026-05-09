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
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NS } from "@ns";
import { useNs } from "./ns";
import { TaskId, TaskState } from "./tasks/types";
import { TASK_STATE_PORT } from "./ports";
import { DashboardController, DashboardState } from "./dashboardTypes";
import { TaskManager } from "./tasks/taskManager";
import { useLogger } from "./logging/log";
import { scanAll } from "./serverMap";

// The interval that the entire dashboard system refreshes at. This controls
// sub-behaviors like task management/kickoff, etc.
const DEFAULT_INTERVAL_MS = 5_000;

function snapshot(ns: NS): DashboardState {
  const raw = ns.peek(TASK_STATE_PORT);
  let taskData = {};

  if (raw !== "NULL PORT DATA") {
    try {
      taskData = JSON.parse(raw as string) as Record<TaskId, TaskState>;
    } catch {
      taskData = {};
    }
  }

  return {
    tick: 0,
    currentVersion: ns.read("version.txt").trim(),
    propagatedVersion: ns.read(".state/version.txt").trim(),
    allServers: scanAll(ns, "home"),
    tasks: taskData,
  };
}

function publishSnapshot(ns: NS, snapshot: DashboardState) {
  ns.clearPort(TASK_STATE_PORT);
  ns.writePort(TASK_STATE_PORT, JSON.stringify(snapshot));
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
      taskManager.runTick(newState); // note the tick wil be wrong, but we don't use it for task management

      setState((prev) => {
        newState.tick = prev.tick + 1;
        publishSnapshot(ns, newState);
        return newState;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [ns, intervalMs]);

  const shutdownTask = useCallback(
    (taskId: TaskId) => {
      const newTaskState = taskManager.shutdown(taskId);

      if (newTaskState) {
        const newState = snapshot(ns);
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
