import { NS } from "@ns";

export function loot(ns: NS, ip: string): void {
  // Open any cache files on the machine
  const files = ns.ls(ip, ".cache");

  if (files.length > 0) {
    for (const file of files) {
      ns.dnet.openCache(file);
    }
  }

  // Use the storm seed for chaos warping if available
  ns.dnet.unleashStormSeed();
}
