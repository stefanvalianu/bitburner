import { ReactNode } from "react";
import { TaskDefinition, TaskId, TaskState } from "@repo/common/tasks/types";
import { GANG_BANGER_TASK_ID, gangBangerTask } from "./gang-banger/info";
import { GangBangerPanel } from "./gang-banger/ux/panel";
import { infoMinerTask } from "./info-miner/info";
import { ULTRAHACKER_TASK_ID, ultrahackerTask } from "./ultrahacker/info";
import { UltrahackerPanel } from "./ultrahacker/ux/panel";
import { INFILTRATOR_TASK_ID, infiltratorTask } from "./infiltrator/info";
import { InfiltratorPanel } from "./infiltrator/ux/panel";
import { contractSolverTask } from "./contract-solver/info";
import { STOCK_TRADER_TASK_ID, stockTraderTask } from "./stock-trader/info";
import { StockTraderPanel } from "./stock-trader/ux/panel";

// highest in list = shows first in 'new task' UX per category
export const ALL_TASKS: TaskDefinition[] = [
  contractSolverTask,
  infoMinerTask,
  gangBangerTask,
  infiltratorTask,
  stockTraderTask,
  //serverBuyerTask,
  ultrahackerTask,
];

export const TASK_BY_ID: ReadonlyMap<TaskId, TaskDefinition> = new Map(
  ALL_TASKS.map((t) => [t.id, t]),
);

export type TaskCustomPanel = (props: { id: TaskId; slot: TaskState }) => ReactNode;

export const TASK_CUSTOM_PANELS: Record<TaskId, TaskCustomPanel> = {
  [INFILTRATOR_TASK_ID]: InfiltratorPanel,
  [ULTRAHACKER_TASK_ID]: UltrahackerPanel,
  [GANG_BANGER_TASK_ID]: GangBangerPanel,
  [STOCK_TRADER_TASK_ID]: StockTraderPanel,
};

export function hasCustomPanel(id: TaskId): boolean {
  return TASK_CUSTOM_PANELS[id] != null;
}
