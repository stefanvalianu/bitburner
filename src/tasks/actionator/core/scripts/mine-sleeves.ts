import { NS } from "@ns";
import { SLEEVE_INFO_PORT } from "@repo/common/ports";
import { SleeveDetails, SleeveInfo } from "@repo/common/info/sleeveInfo";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

/*
  This script is responsible for:
  - Updating current information about the player's sleeves
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));
  
  let sleeves: SleeveDetails[] = [];

  // if we were at max sleeves (8) we could skip this, but this is safer for others
  const maxSleeves = ns.sleeve.getNumSleeves();

  for (let i = 0; i < maxSleeves; i++) {
    const sleeveInfo = ns.sleeve.getSleeve(i);

    sleeves.push({
      index: i,
      city: sleeveInfo.city,
      shock: sleeveInfo.shock,
      
      str: sleeveInfo.skills.strength,
      def: sleeveInfo.skills.defense,
      dex: sleeveInfo.skills.dexterity,
      agi: sleeveInfo.skills.agility,

      sync: sleeveInfo.sync,
      task: ns.sleeve.getTask(i)?.type ?? null,
      purchaseableAugments: ns.sleeve.getSleevePurchasableAugs(i),
    });
  }

  ns.clearPort(SLEEVE_INFO_PORT);
  ns.writePort(SLEEVE_INFO_PORT, {
    sleeves: sleeves
  } satisfies SleeveInfo);
}
