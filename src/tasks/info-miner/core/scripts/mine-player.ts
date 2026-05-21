import { NS } from "@ns";
import { PlayerInfo } from "@repo/common/info/playerInfo";
import { PLAYER_INFO_PORT } from "@repo/common/ports";
import { invokeNextScript } from "./helpers";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const player = ns.getPlayer();
  const hasFormulas = ns.fileExists(ns.enums.ProgramName.formulas, "home");

  ns.clearPort(PLAYER_INFO_PORT);
  ns.writePort(PLAYER_INFO_PORT, {
    money: player.money,
    hpCur: player.hp.current,
    hpMax: player.hp.max,
    hasFormulas: hasFormulas
  } satisfies PlayerInfo);

  invokeNextScript(ns);
}
