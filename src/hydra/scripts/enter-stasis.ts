import { NS } from "@ns";
import { HydraInstanceUpdate } from "@repo/common/info/hydra";
import { HYDRA_UPDATE_PORT } from "@repo/common/ports";
import { CYAN, RESET } from "@repo/hydra/types";

/*
  Script is used to stasis-link a server near a labyrinth to give the player time to solve it.
  Because stasis-link uses a lot of RAM, the hydra server itself tears down in order to call this script,
  so we'll need to re-spawn the hydra on finish.
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  ns.tprint(`${CYAN}STASIS LINKING${RESET} ${ns.getHostname()}`);
  ns.writePort(HYDRA_UPDATE_PORT, {
    ip: ns.getIP(),
    type: "stasis-linking"
  } satisfies HydraInstanceUpdate);
  await ns.dnet.setStasisLink(true);
}
