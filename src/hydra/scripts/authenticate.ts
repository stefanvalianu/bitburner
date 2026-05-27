import { NS } from "@ns";
import { CYAN, HydraAuthInfo, RED, RESET } from "../types";
import { getCodebreaker } from "../codebreakers";
import { spawnHydra } from "../infect-helper";

/*
  This script is called from the hydra controller to break authentication on a set of targets.
  The caller essentially "blocks" on this script finishing, in that it refuses new work (other than)
  connecting/scping to neighbors until the lockfile is cleared.
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  const targets = JSON.parse(ns.args[0] as string) as HydraAuthInfo[];

  for (const target of targets) {
    const codebreaker = getCodebreaker(target, ns);
    const result = await codebreaker.tryAuthenticate();

    if (result.result === "ok") {
      spawnHydra(ns, target.targetIp);
    } else if (result.result === "failed") {
      ns.tprint(`Cannot solve ${target.targetModel}`);
      printCoreInfo(ns, target);
    } else if (result.result === "transient") {
      // it happens, what can we do. could be a sign that a solver is taking too long/is too slow
    }
  }
}

function printCoreInfo(ns: NS, info: HydraAuthInfo): void {
  ns.tprint(`model: ${RED}${info.targetModel}${RESET} host: ${CYAN}${info.targetIp}${RESET}`);
  ns.tprint(`hint: ${CYAN}${info.targetPasswordHint}${RESET} data: ${CYAN}${info.targetPasswordData}${RESET}`);
  ns.tprint(`format: ${CYAN}${info.targetPasswordFormat}${RESET} len: ${CYAN}${info.targetPasswordLength}${RESET}`);
  ns.tprint(`---------------------------------------------------`);
}
