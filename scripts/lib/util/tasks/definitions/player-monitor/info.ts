import { DashboardState } from "../../../dashboardTypes";
import { TaskDefinition } from "../../types";

export const PLAYER_MONITOR_TASK_ID = "player-monitor";

export interface Inventory {
  hasRouter: boolean;
  hasFormulas: boolean;
  portOpeners: { name: string; owned: boolean }[];
  programs: { name: string; owned: boolean }[];
}

export interface Stats {
  hackingLevel: number;
}

export interface PlayerMonitorTaskState extends Record<string, unknown> {
  inventory?: Inventory;
  stats?: Stats;
}

export const playerMonitorTask: TaskDefinition = {
  id: PLAYER_MONITOR_TASK_ID,
  description:
    "Responsible for monitoring the player state and reporting it. Includes things like attributes, money, purchased hacks, etc.",
  autostart: true,
  demand: {
    priority: "critical",
  },
};

export function getPlayerMonitorState(state: DashboardState): PlayerMonitorTaskState | undefined {
  if (!state.tasks) return undefined;
  return state.tasks[PLAYER_MONITOR_TASK_ID] as PlayerMonitorTaskState;
}
