import { NS } from "@ns";
import { ACTIONATOR_QUEUE_PORT, GANG_INFO_PORT } from "@repo/common/ports";
import { GangInfo, GangMember } from "@repo/common/info/gangInfo";
import { invokeNextScript, requestStopScriptAutorun, requestTaskStart } from "@repo/tasks/actionator/core/helpers";
import { GANG_BANGER_TASK_ID } from "@repo/tasks/gang-banger/info";
import { GANG_EQUIPMENT_SCRIPT } from "./identify-gang";

export const MINE_GANG_SCRIPT_PATH = "tasks/actionator/core/scripts/mine-gang.js";

const KARMA_TO_START_GANG = -54_000;
const MAX_GANG_MEMBERS = 12;

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

    // this script ran first; if we weren't in a gang, it didn't actually run, but we need it
    ns.writePort(ACTIONATOR_QUEUE_PORT, GANG_EQUIPMENT_SCRIPT);
  }

  if (!inGang) {
    ns.clearPort(GANG_INFO_PORT);
    ns.writePort(GANG_INFO_PORT, {
      hasGang: false,
      members: [],
      territory: 0
    } satisfies GangInfo);
    invokeNextScript(ns);
    return;
  }

  const gang = ns.gang.getGangInformation();
  const members = ns.gang.getMemberNames().map(n => ns.gang.getMemberInformation(n));
  const gangMembers = members.map(m => ({
    name: m.name,
  } satisfies GangMember));

  ns.clearPort(GANG_INFO_PORT);
  ns.writePort(GANG_INFO_PORT, {
    hasGang: inGang,
    members: gangMembers,
    territory: gang.territory
  } satisfies GangInfo);

  // if we're at max territory and max members, we don't need to update this info anymore
  if (members.length === MAX_GANG_MEMBERS && gang.territory === 1) {
    requestStopScriptAutorun(ns, MINE_GANG_SCRIPT_PATH);
  }

  invokeNextScript(ns);
}
