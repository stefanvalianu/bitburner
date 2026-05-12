import { TaskDefinition, TaskState } from "../../types";

export const STOCK_TRADER_TASK_ID = "stock-trader";

export interface StockTraderTaskState extends TaskState {
  todo: string;
}

export const stockTraderTask: TaskDefinition = {
  id: STOCK_TRADER_TASK_ID,
  description: "Manages trading stocks across all levels of access.",
  category: "general",
  icon: "💵",
  autostart: false,
  demand: {
    priority: "normal"
  },
};
