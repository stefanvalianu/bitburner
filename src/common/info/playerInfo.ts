import { NS } from "@ns";
import { PLAYER_INFO_PORT, getPortData } from "@repo/common/ports";

export interface PlayerInfo {
  hpCur: number;
  hpMax: number;
  money: number;

  hasFormulas: boolean;
}

export function readPlayerInfo(ns: NS): PlayerInfo | undefined {
  return getPortData<PlayerInfo>(ns, PLAYER_INFO_PORT);
}
