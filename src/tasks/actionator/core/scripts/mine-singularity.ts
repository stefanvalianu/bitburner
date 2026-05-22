import { NS } from "@ns";
import { INFO_MINER_QUEUE_PORT } from "@repo/common/ports";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

/*
  This script is responsible for:
  - Updating the state of the player, their actions, etc
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  invokeNextScript(ns, INFO_MINER_QUEUE_PORT);
}
