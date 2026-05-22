import { AugmentPair, CityName, NS, SleeveTask } from "@ns";
import { SLEEVE_INFO_PORT, getPortData } from "@repo/common/ports";

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

export function readSleeveInfo(ns: NS): SleeveInfo | undefined {
  return getPortData<SleeveInfo>(ns, SLEEVE_INFO_PORT);
}
