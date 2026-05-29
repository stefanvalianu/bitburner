import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const ip = ns.args[0] as string;

  // Bring blocked RAM to 0
  while (ns.dnet.getBlockedRam(ip) > 0) {
    const result = await ns.dnet.memoryReallocation(ip);
    if (!result.success) {
      break;
    }
  }
}
