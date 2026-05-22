export interface GangMember {
  name: string;
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
