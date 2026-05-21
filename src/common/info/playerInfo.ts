import { CityName, NS } from "@ns";
import { PLAYER_INFO_PORT, getPortData } from "@repo/common/ports";

export interface PlayerInfo {
  hpCur: number;
  hpMax: number;
  money: number;

  karma: number;
  murders: number;

  hasFormulas: boolean;

  skillHacking: number;
  xpHacking: number;
  multHacking: number;

  skillStrength: number;
  xpStrength: number;
  multStrength: number;

  skillDefense: number;
  xpDefense: number;
  multDefense: number;

  skillDexterity: number;
  xpDexterity: number;
  multDexterity: number;

  skillAgility: number;
  xpAgility: number;
  multAgility: number;

  skillCharisma: number;
  xpCharisma: number;
  multCharisma: number;

  skillIntelligence: number;
  xpIntelligence: number;

  city: CityName;
}

export function readPlayerInfo(ns: NS): PlayerInfo | undefined {
  return getPortData<PlayerInfo>(ns, PLAYER_INFO_PORT);
}
