import { ReactNode } from "react";
import { TaskDefinition, TaskId, TaskState } from "../types";
import { contractSolverTask } from "./contract-solver/info";
import { infiltrationSolverTask } from "./infiltration-solver/info";
import { INFILTRATOR_TASK_ID, infiltratorTask } from "./infiltrator/info";
import { InfiltratorPanel } from "./infiltrator/panel";
import { NOFORM_HACKER_TASK_ID, noformHackerTask } from "./noform-hacker/info";
import { NoformHackerPanel } from "./noform-hacker/panel";
import { playerMonitorTask } from "./player-monitor/info";
import { serverBuyerTask } from "./server-buyer/info";
import { serverDevourerTask } from "./server-devourer/info";
import { serverShareTask } from "./server-share/info";
import { ULTRAHACKER_TASK_ID, ultrahackerTask } from "./ultrahacker/info";
import { UltrahackerPanel } from "./ultrahacker/panel";
import { stockTraderTask } from "./stock-trader/info";

// highest in list = shows first in 'new task' UX per category
export const ALL_TASKS: TaskDefinition[] = [
  contractSolverTask,
  infiltratorTask,
  infiltrationSolverTask,
  stockTraderTask,
  playerMonitorTask,
  serverBuyerTask,
  ultrahackerTask,
  noformHackerTask,
  serverDevourerTask,
  serverShareTask,
];

export const TASK_BY_ID: ReadonlyMap<TaskId, TaskDefinition> = new Map(
  ALL_TASKS.map((t) => [t.id, t]),
);

// -------------------NOTE-----------------------
// Do not use netscript functions that have a
// ram cost in these panels! That will increase
// the ram cost of the root dashboard script,
// which we ABSOLUTELY DO NOT WANT!
// ----------------------------------------------
export type TaskCustomPanel = (props: { id: string; slot: TaskState }) => ReactNode;

export const TASK_CUSTOM_PANELS: Record<string, TaskCustomPanel> = {
  [NOFORM_HACKER_TASK_ID]: NoformHackerPanel,
  [INFILTRATOR_TASK_ID]: InfiltratorPanel,
  [ULTRAHACKER_TASK_ID]: UltrahackerPanel,
};

export function hasCustomPanel(id: string): boolean {
  return TASK_CUSTOM_PANELS[id] != null;
}
