import { GangGenInfo, GangMemberInfo } from "@ns";
import { TaskDefinition, TaskState } from "../../types";

export const GANG_BANGER_TASK_ID = "gang-banger";

export type MemberRank = "I" | "II" | "III" | "IV" | "V";

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
};
