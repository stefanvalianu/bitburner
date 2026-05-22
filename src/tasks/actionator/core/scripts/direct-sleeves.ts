import { NS } from "@ns";
import { SleeveInfo } from "@repo/common/info/sleeveInfo";
import { ACTIONATOR_QUEUE_PORT, getPortData, SLEEVE_INFO_PORT, USER_PREFERENCES_PORT } from "@repo/common/ports";
import { UserPreferences } from "@repo/common/preferences";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

const DEFAULT_SLEEVE_SHOCK_TARGET = 0;

/*
  This script is responsible for:
  - assigning tasks to sleeves
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  const sleeveInfo = getPortData<SleeveInfo>(ns, SLEEVE_INFO_PORT);
  const userPreferences = getPortData<UserPreferences>(ns, USER_PREFERENCES_PORT);

  const targetShockLevel = userPreferences?.sleeveShockTarget ?? DEFAULT_SLEEVE_SHOCK_TARGET;

  if (sleeveInfo) {
    for (const sleeve of sleeveInfo.sleeves) {
      if (sleeve.shock > targetShockLevel) {
        ns.sleeve.setToShockRecovery(sleeve.index);
        continue;
      }
    }
  }

  invokeNextScript(ns, ACTIONATOR_QUEUE_PORT);
}
