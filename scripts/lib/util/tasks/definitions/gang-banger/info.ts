import { GangGenInfo, GangMemberInfo } from "@ns";
import { TaskDefinition, TaskState } from "../../types";
import { DashboardState } from "../../../dashboardTypes";
import { getPlayerMonitorState } from "../player-monitor/info";

export const GANG_BANGER_TASK_ID = "gang-banger";

// Generally, here are the ranking rules we're going with:
// I: (<6 ascension multiplier)
// II: (<16 ascension multiplier)
// III: (<32 ascension multiplier)
// IV: 32+
// We only buy non-augmentation equipment starting
// at rank II.
export type MemberRank = "I" | "II" | "III" | "IV";

export interface GangMember extends GangMemberInfo {
  rank: MemberRank;
}

export interface GangBangerTaskState extends TaskState {
  members: GangMember[];
  gang?: GangGenInfo | undefined;
}

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
