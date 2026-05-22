import { NS } from "@ns";
import { INFO_MINER_QUEUE_PORT, SLEEVE_INFO_PORT } from "@repo/common/ports";
import { SleeveDetails, SleeveInfo } from "@repo/common/info/sleeveInfo";
import { invokeNextScript } from "@repo/common/tasks/subscriptHelpers";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  let sleeves: SleeveDetails[] = [];

  // if we were at max sleeves (8) we could skip this, but this is safer for others
  const maxSleeves = ns.sleeve.getNumSleeves();

  for (let i = 0; i < maxSleeves; i++) {
    const sleeveInfo = ns.sleeve.getSleeve(i);

    sleeves.push({
      index: i,
      city: sleeveInfo.city,
      shock: sleeveInfo.shock,
      sync: sleeveInfo.sync,
      task: ns.sleeve.getTask(i)?.type ?? "NONE",
      purchaseableAugments: ns.sleeve.getSleevePurchasableAugs(i),
    });
  }

  ns.clearPort(SLEEVE_INFO_PORT);
  ns.writePort(SLEEVE_INFO_PORT, {
    sleeves: sleeves
  } satisfies SleeveInfo);

  invokeNextScript(ns, INFO_MINER_QUEUE_PORT);
}
