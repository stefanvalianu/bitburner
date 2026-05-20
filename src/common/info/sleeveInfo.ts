import { NS } from "@ns";
import { SLEEVE_INFO_PORT, getPortData } from "@repo/common/ports";

export interface SleeveInfo {

}

export function readSleeveInfo(ns: NS): SleeveInfo | undefined {
  return getPortData<SleeveInfo>(ns, SLEEVE_INFO_PORT);
}
