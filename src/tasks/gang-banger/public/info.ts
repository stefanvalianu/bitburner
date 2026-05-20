import { TaskDefinition } from "@repo/common/tasks/types";
import { DashboardState } from "@repo/features/dashboardTypes";
import { getPlayerMonitorState } from "../../player-monitor/info";

export const GANG_BANGER_TASK_ID = "gang-banger";

export const gangBangerTask: TaskDefinition = {
  id: GANG_BANGER_TASK_ID,
  description: "Manages your gangs! Slum snakes rule!",
  category: "general",
  icon: "🐍",
  autostart: false,
  demand: {
    priority: "normal",
  },
  checkRequirements: (state: DashboardState) => {
    const playerState = getPlayerMonitorState(state);
    if (playerState === undefined || playerState.inventory === undefined) return "Just a sec...";
    if (!playerState.inventory.hasFormulas) return "Missing Formulas.exe";

    return undefined;
  },
};
