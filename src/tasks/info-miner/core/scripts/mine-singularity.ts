import { NS } from "@ns";
import { INFO_MINER_QUEUE_PORT } from "@repo/common/ports";
import { invokeNextScript } from "@repo/common/tasks/subscriptHelpers";

/*
  This script is responsible for:
  - Backdooring all available servers
  - Destroying the w0rld d3mon
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  invokeNextScript(ns, INFO_MINER_QUEUE_PORT);
}
