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
    hasFormulas: hasFormulas,
    city: player.city,
    murders: player.numPeopleKilled,
    karma: player.karma,

    skillAgility: player.skills.agility,
    xpAgility: player.exp.agility,
    multAgility: player.mults.agility,

    skillCharisma: player.skills.charisma,
    xpCharisma: player.exp.charisma,
    multCharisma: player.mults.charisma,

    skillDefense: player.skills.defense,
    xpDefense: player.exp.defense,
    multDefense: player.mults.defense,

    skillDexterity: player.skills.dexterity,
    xpDexterity: player.exp.dexterity,
    multDexterity: player.mults.dexterity,

    skillHacking: player.skills.hacking,
    xpHacking: player.exp.hacking,
    multHacking: player.mults.hacking,

    skillIntelligence: player.skills.intelligence,
    xpIntelligence: player.exp.intelligence,

    skillStrength: player.skills.strength,
    xpStrength: player.exp.strength,
    multStrength: player.mults.strength
  } satisfies PlayerInfo);

  invokeNextScript(ns);
}
