// Generally, here are the ranking rules we're going with:
// I: (<6 ascension multiplier)
// II: (<16 ascension multiplier)
// III: (<32 ascension multiplier)
// IV: 32+
// We only buy non-augmentation equipment starting
// at rank II.
export type MemberRank = 1 | 2 | 3 | 4;

export interface GangMember {
  name: string;

  avgCombatSkill: number;
  avgCombatMult: number;

  rank: MemberRank;
}

export interface GangInfo {
  hasGang: boolean;

  members: GangMember[];
  territory: number;
}

export interface GangEquipmentInfo {
  // Augmentations persist through ascensions
  augmentations: string[];

  // Normal equipment does not
  normalEquipment: string[];
}
