import { ReactNode } from "react";
import { TaskDefinition, TaskId, TaskState } from "@repo/common/tasks/types";
import { contractSolverTask } from "./contract-solver/public/info";
import { infiltrationSolverTask } from "./infiltration-solver/info";
import { INFILTRATOR_TASK_ID, infiltratorTask } from "./infiltrator/info";
import { InfiltratorPanel } from "./infiltrator/panel";
import { NOFORM_HACKER_TASK_ID, noformHackerTask } from "./noform-hacker/info";
import { NoformHackerPanel } from "./noform-hacker/panel";
import { serverBuyerTask } from "./server-buyer/info";
import { serverShareTask } from "./server-share/public/info";
import { ULTRAHACKER_TASK_ID, ultrahackerTask } from "./ultrahacker/public/info";
import { UltrahackerPanel } from "./ultrahacker/public/panel";
import { STOCK_TRADER_TASK_ID, stockTraderTask } from "./stock-trader/public/info";
import { StockTraderPanel } from "./stock-trader/public/panel";
import { GANG_BANGER_TASK_ID, gangBangerTask } from "./gang-banger/public/info";
import { GangBangerPanel } from "./gang-banger/public/panel";

// highest in list = shows first in 'new task' UX per category
export const ALL_TASKS: TaskDefinition[] = [
  contractSolverTask,
  gangBangerTask,
  infiltratorTask,
  infiltrationSolverTask,
  stockTraderTask,
  serverBuyerTask,
  ultrahackerTask,
  noformHackerTask,
  serverShareTask,
];

export const TASK_BY_ID: ReadonlyMap<TaskId, TaskDefinition> = new Map(
  ALL_TASKS.map((t) => [t.id, t]),
);

export type TaskCustomPanel = (props: { id: string; slot: TaskState }) => ReactNode;

export const TASK_CUSTOM_PANELS: Record<string, TaskCustomPanel> = {
  [NOFORM_HACKER_TASK_ID]: NoformHackerPanel,
  [INFILTRATOR_TASK_ID]: InfiltratorPanel,
  [ULTRAHACKER_TASK_ID]: UltrahackerPanel,
  [GANG_BANGER_TASK_ID]: GangBangerPanel,
  [STOCK_TRADER_TASK_ID]: StockTraderPanel,
};

export function hasCustomPanel(id: string): boolean {
  return TASK_CUSTOM_PANELS[id] != null;
}
