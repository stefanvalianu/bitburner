import { NS } from "@ns";
import { HydraInstanceUpdate } from "@repo/common/info/hydra";
import { getPortData, HYDRA_UPDATE_PORT } from "@repo/common/ports";
import { CYAN, HydraIpPortState, RESET } from "@repo/hydra/types";
import { ipv4ToUint32Fast } from "../helpers";

/*
  Script is used to stasis-link a server near a labyrinth to give the player time to solve it.
  Because stasis-link uses a lot of RAM, the hydra server itself tears down in order to call this script,
  so we'll need to re-spawn the hydra on finish.
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  // Don't claim we linked before this finishes lol, if server moves before it's done it would lead to bad state
  await ns.dnet.setStasisLink(true);

  const isLab = ns.args[0] as boolean;
  const ip = ns.getIP();
  const port = ipv4ToUint32Fast(ip);

  const portData = getPortData<HydraIpPortState>(ns, port);
  const password = portData!.password!;

  ns.tprint(`${CYAN}STASIS LINKING${RESET} ${ns.getHostname()}`);
  ns.writePort(HYDRA_UPDATE_PORT, {
    info: {
      ip,
      password
    },
    type: isLab ? "lab-stasis-linking" : "stasis-linking"
  } satisfies HydraInstanceUpdate);
}
