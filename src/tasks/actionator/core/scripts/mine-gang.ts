import { NS } from "@ns";
import { GANG_INFO_PORT } from "@repo/common/ports";
import { GangInfo } from "@repo/common/info/gangInfo";
import { invokeNextScript, requestTaskStart } from "@repo/tasks/actionator/core/helpers";
import { GANG_BANGER_TASK_ID } from "@repo/tasks/gang-banger/info";

const KARMA_TO_START_GANG = -54_000;

/*
  This script is responsible for:
  - Providing gang information on the GANG_INFO_PORT
  - Requesting a start of the "gang-banger" script if not in a gang but ready
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  const inGang = ns.gang.inGang();
  const player = ns.getPlayer();

  if (!inGang && player.karma <= KARMA_TO_START_GANG) {
    // this script will start a gang when instantiated, breaking this cycle
    requestTaskStart(ns, GANG_BANGER_TASK_ID);
  }

  ns.clearPort(GANG_INFO_PORT);
  ns.writePort(GANG_INFO_PORT, {
    hasGang: inGang
  } satisfies GangInfo);

  invokeNextScript(ns);
}
