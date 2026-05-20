import { GangGenInfo, GangMemberInfo } from "@ns";
import { TaskState } from "@repo/common/tasks/types";

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

export interface GangBangerTaskState extends TaskState {
  members: GangMember[];
  gang?: GangGenInfo | undefined;
}