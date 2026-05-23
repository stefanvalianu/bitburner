export interface GangMember {
  name: string;
}

export interface GangInfo {
  hasGang: boolean;

  members: GangMember[];
  maxMembers: number;

  territory: number;
  name: string;
}

export interface GangEquipmentInfo {
  // Augmentations persist through ascensions
  augmentations: string[];

  // Normal equipment does not
  normalEquipment: string[];
}
