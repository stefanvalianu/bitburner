import { AugmentPair, CityName, SleeveTask } from "@ns";

export interface SleeveDetails {
  index: number;
  city: CityName;
  task: SleeveTask["type"] | null;
  purchaseableAugments: AugmentPair[];

  str: number;
  def: number;
  dex: number;
  agi: number;

  shock: number;
  sync: number;
}

export interface SleeveInfo {
  sleeves: SleeveDetails[];
}