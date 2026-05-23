import { ReactNode } from "react";
import { TaskDefinition, TaskId, TaskState } from "@repo/common/tasks/types";
import { gangBangerTask } from "./gang-banger/info";
import { ULTRAHACKER_TASK_ID, ultrahackerTask } from "./ultrahacker/info";
import { UltrahackerPanel } from "./ultrahacker/ux/panel";
import { INFILTRATOR_TASK_ID, infiltratorTask } from "./infiltrator/info";
import { InfiltratorPanel } from "./infiltrator/ux/panel";
import { STOCK_TRADER_TASK_ID, stockTraderTask } from "./stock-trader/info";
import { StockTraderPanel } from "./stock-trader/ux/panel";
import { actionatorTask } from "./actionator/info";
import { backdoorerTask } from "./backdoorer/info";
import { bladeAgentTask } from "./blade-agent/info";

// highest in list = shows first in 'new task' UX per category
export const ALL_TASKS: TaskDefinition[] = [
  actionatorTask,
  gangBangerTask,
  infiltratorTask,
  stockTraderTask,
  ultrahackerTask,
  backdoorerTask,
  bladeAgentTask,
];

export const TASK_BY_ID: ReadonlyMap<TaskId, TaskDefinition> = new Map(
  ALL_TASKS.map((t) => [t.id, t]),
);

export type TaskCustomPanel = (props: { id: TaskId; slot: TaskState }) => ReactNode;

export const TASK_CUSTOM_PANELS: Record<TaskId, TaskCustomPanel> = {
  [INFILTRATOR_TASK_ID]: InfiltratorPanel,
  [ULTRAHACKER_TASK_ID]: UltrahackerPanel,
  [STOCK_TRADER_TASK_ID]: StockTraderPanel,
};

export function hasCustomPanel(id: TaskId): boolean {
  return TASK_CUSTOM_PANELS[id] != null;
}
