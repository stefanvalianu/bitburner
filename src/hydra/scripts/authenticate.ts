import { NS } from "@ns";
import { HydraAuthInfo, HYDRA_LOCKFILE } from "../types";
import { getCodebreaker } from "../codebreakers";
import { spawnHydra } from "../infect-helper";

/*
  This script is called from the hydra controller to break authentication on a set of targets.
  The caller essentially "blocks" on this script finishing, in that it refuses new work (other than)
  connecting/scping to neighbors until the lockfile is cleared.
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => ns.write(HYDRA_LOCKFILE, "", "w"));

  ns.write(HYDRA_LOCKFILE, "locked", "w");
  const targets = JSON.parse(ns.args[0] as string) as HydraAuthInfo[];

  for (const target of targets) {
    const codebreaker = getCodebreaker(target, ns);
    const result = await codebreaker.tryAuthenticate();

    if (result.result === "ok") {
      spawnHydra(ns, target.targetIp);
    } else if (result.result === "impossible") {
      ns.tprint(`Cannot solve ${target.targetModel}`);
    } else if (result.result === "transient") {
      ns.tprint(`Transient error trying to authenticate to ${target.targetModel}`);
    }
  }
}
