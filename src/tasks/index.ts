import { ReactNode } from "react";
import { TaskDefinition, TaskId, TaskState } from "@repo/common/tasks/types";
import { GANG_BANGER_TASK_ID, gangBangerTask } from "./gang-banger/info";
import { GangBangerPanel } from "./gang-banger/ux/panel";

// highest in list = shows first in 'new task' UX per category
export const ALL_TASKS: TaskDefinition[] = [
  //contractSolverTask,
  gangBangerTask,
  //infiltratorTask,
  //infiltrationSolverTask,
  //stockTraderTask,
  //serverBuyerTask,
  //ultrahackerTask,
  //noformHackerTask,
  //serverShareTask,
];

export const TASK_BY_ID: ReadonlyMap<TaskId, TaskDefinition> = new Map(
  ALL_TASKS.map((t) => [t.id, t]),
);

export type TaskCustomPanel = (props: { id: string; slot: TaskState }) => ReactNode;

export const TASK_CUSTOM_PANELS: Record<string, TaskCustomPanel> = {
  //[NOFORM_HACKER_TASK_ID]: NoformHackerPanel,
  //[INFILTRATOR_TASK_ID]: InfiltratorPanel,
  //[ULTRAHACKER_TASK_ID]: UltrahackerPanel,
  [GANG_BANGER_TASK_ID]: GangBangerPanel,
  //[STOCK_TRADER_TASK_ID]: StockTraderPanel,
};

export function hasCustomPanel(id: string): boolean {
  return TASK_CUSTOM_PANELS[id] != null;
}
