import { NS } from "@ns";
import { GANG_INFO_PORT, INFO_MINER_QUEUE_PORT } from "@repo/common/ports";
import { GangInfo } from "@repo/common/info/gangInfo";
import { invokeNextScript } from "@repo/common/tasks/subscriptHelpers";

/*
  This script is responsible for:
  - 
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  ns.clearPort(GANG_INFO_PORT);
  ns.writePort(GANG_INFO_PORT, {
  } satisfies GangInfo);

  invokeNextScript(ns, INFO_MINER_QUEUE_PORT);
}
