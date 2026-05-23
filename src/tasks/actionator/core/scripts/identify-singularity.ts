import { NS } from "@ns";
import { crawlServers } from "@repo/common/crawlServers";
import { invokeNextScript, requestTaskStart } from "@repo/tasks/actionator/core/helpers";
import { BACKDOORER_TASK_ID } from "@repo/tasks/backdoorer/info";

/*
  This script is responsible for:
  - Producing the list of available augmentations, their sources, etc
  - Producing the list of available companies and jobs (filtering to important ones)
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));

  // if there are backdoorable servers, we should request for the backdooring task to start
  if (crawlServers(ns).find(s => !s.purchasedByPlayer && s.hackDifficulty && !s.backdoorInstalled) !== undefined) {
    requestTaskStart(ns, BACKDOORER_TASK_ID);
  }
}
