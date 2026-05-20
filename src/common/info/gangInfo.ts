import { NS } from "@ns";
import { GANG_INFO_PORT, getPortData } from "@repo/common/ports";

export interface GangInfo {

}

export function readGangInfo(ns: NS): GangInfo | undefined {
  return getPortData<GangInfo>(ns, GANG_INFO_PORT);
}
