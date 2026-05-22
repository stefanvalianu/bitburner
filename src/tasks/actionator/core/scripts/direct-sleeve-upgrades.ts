import { NS } from "@ns";
import { SleeveInfo } from "@repo/common/info/sleeveInfo";
import { getPortData, SLEEVE_INFO_PORT, USER_PREFERENCES_PORT } from "@repo/common/ports";
import { UserPreferences } from "@repo/common/preferences";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

export const SLEEVE_UPGRADE_SCRIPT = "tasks/actionator/core/scripts/direct-sleeve-upgrades.js";

const PERCENTAGE_OF_BUDGET_TO_SPEND_ON_SLEEVE_UPGRADES = 0.3;

/*
  This script is responsible for:
  - Purchasing upgrades for sleeves
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  const sleeveInfo = getPortData<SleeveInfo>(ns, SLEEVE_INFO_PORT);
  const userPreferences = getPortData<UserPreferences>(ns, USER_PREFERENCES_PORT);

  if (!sleeveInfo || userPreferences?.purchaseSleeveAugmentations === false) {
    invokeNextScript(ns);
    return;

  }

  let budget = (ns.getServerMoneyAvailable("home") - (userPreferences?.reservedMoney || 0)) * PERCENTAGE_OF_BUDGET_TO_SPEND_ON_SLEEVE_UPGRADES;

  if (budget > 0) {
    for (const sleeve of sleeveInfo.sleeves) {
      for (const aug of sleeve.purchaseableAugments) {
        if (budget >= aug.cost) {
          if (ns.sleeve.purchaseSleeveAug(sleeve.index, aug.name)) {
            budget -= aug.cost;
          }
        }

        if (budget <= 0) {
          // early exit
          invokeNextScript(ns);
          return;
        }
      }
    }
  }

  invokeNextScript(ns);
}
