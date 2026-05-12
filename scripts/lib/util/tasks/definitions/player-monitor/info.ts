import { Player } from "@ns";
import { DashboardState } from "../../../dashboardTypes";
import { TaskDefinition, TaskState } from "../../types";
import { PLAYER_STATE_PORT } from "../../../ports";

export const PLAYER_MONITOR_TASK_ID = "player-monitor";

export const PLAYER_MONITOR_FAST_REFRESH_FREQUENCY_MS = 500;

export interface Inventory {
  hasRouter: boolean;
  hasFormulas: boolean;
  portOpeners: { name: string; owned: boolean }[];
  programs: { name: string; owned: boolean }[];
}

export interface PlayerMonitorTaskState extends TaskState {
  inventory: Inventory;
  player: Player;
}

// this task publishes both to the standard dashboard state, but also to a player-specific port
// it also runs at a faster interval to have a more responsive UX, since player state has higher
// freshness requirements (money, skills, etc)
export const playerMonitorTask: TaskDefinition = {
  id: PLAYER_MONITOR_TASK_ID,
  description:
    "Responsible for monitoring the player state and reporting it. Includes things like attributes, money, purchased hacks, etc.",
  category: "general",
  communicationPort: PLAYER_STATE_PORT,
  icon: "🩻",
  autostart: true,
  demand: {
    priority: "critical",
  },
};

export function getPlayerMonitorState(state: DashboardState): PlayerMonitorTaskState | undefined {
  if (!state.tasks) return undefined;
  return state.tasks[PLAYER_MONITOR_TASK_ID] as PlayerMonitorTaskState;
}
