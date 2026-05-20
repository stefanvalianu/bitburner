import { PlayerInfo, readPlayerInfo } from "./playerInfo";
import { readSleeveInfo, SleeveInfo } from "./sleeveInfo";
import { GangInfo, readGangInfo } from "./gangInfo";
import { readServerInfo, ServerInfo } from "./serverInfo";
import { NS } from "@ns";

export interface GameInfo {
  player?: PlayerInfo | undefined;
  servers?: ServerInfo | undefined;
  sleeves?: SleeveInfo | undefined;
  gang?: GangInfo | undefined;
}

// retrieves the game information from the various ports
export function readGameInfo(ns: NS): GameInfo {
  return {
    player: readPlayerInfo(ns),
    servers: readServerInfo(ns),
    sleeves: readSleeveInfo(ns),
    gang: readGangInfo(ns),
  };
}
