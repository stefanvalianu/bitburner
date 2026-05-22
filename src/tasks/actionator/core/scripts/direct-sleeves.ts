import { NS } from "@ns";
import { SleeveInfo } from "@repo/common/info/sleeveInfo";
import { ACTIONATOR_QUEUE_PORT, getPortData, SLEEVE_INFO_PORT } from "@repo/common/ports";
import { invokeNextScript } from "@repo/common/tasks/subscriptHelpers";

/*
  This script is responsible for:
  - assigning tasks to sleeves
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  const sleeveInfo = getPortData<SleeveInfo>(ns, SLEEVE_INFO_PORT);

  if (sleeveInfo) {
    // Figure out what the sleeve should do
  }

  invokeNextScript(ns, ACTIONATOR_QUEUE_PORT);
}
