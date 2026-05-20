import { TaskDefinition } from "@repo/common/tasks/types";
import { GANG_BANGER_STATE_PORT } from "@repo/common/ports";
import { GameInfo } from "@repo/common/info/gameInfo";
import { GangGenInfo, GangMemberInfo } from "@ns";

export const GANG_BANGER_TASK_ID = "gang-banger";

export const gangBangerTask: TaskDefinition = {
  id: GANG_BANGER_TASK_ID,
  description: "Manages your gangs. Slum snakes rule!",
  category: "general",
  icon: "🐍",
  autostart: false,
  demand: {
    priority: "normal",
  },
  statePort: GANG_BANGER_STATE_PORT,
  checkRequirements: (gameInfo: GameInfo) => {
    if (gameInfo === undefined || gameInfo.player === undefined) return "Just a sec...";
    if (!gameInfo.player.hasFormulas) return "Missing Formulas.exe";

    return undefined;
  },
};

// Generally, here are the ranking rules we're going with:
// I: (<6 ascension multiplier)
// II: (<16 ascension multiplier)
// III: (<32 ascension multiplier)
// IV: 32+
// We only buy non-augmentation equipment starting
// at rank II.
export type MemberRank = 1 | 2 | 3 | 4;

export interface GangMember {
  info: GangMemberInfo;
  rank: MemberRank;
}

export interface GangBangerTaskState {
  members: GangMember[];
  gang?: GangGenInfo | undefined;
}
