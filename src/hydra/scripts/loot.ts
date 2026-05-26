import { NS } from "@ns";
import { CYAN, RESET } from "../types";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const ip = ns.args[0] as string;
  const listFiles = ns.args[1] as boolean;
  
  const caches = ns.ls(ip, ".cache");
  for (const cache of caches) {
    ns.dnet.openCache(cache);
  }

  if (listFiles) {
    let files = [...ns.ls(ip, ".txt"), ...ns.ls(ip, ".lit")];
    for (const file of files) {
      // todo probably send useful stuff to the central brain or updating ip port state ourselves if possible
      ns.tprint(`${CYAN}FILE${RESET}: ${ns.read(file)}`);
    }
  }

  // Use the storm seed for chaos warping if available
  ns.dnet.unleashStormSeed();
}
