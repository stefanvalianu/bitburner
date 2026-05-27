import { NS } from "@ns";
import { LOOT_SCRIPT } from "@repo/hydra/types";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const ip = ns.args[0] as string;
  const loot = ns.args[1] as boolean;

  // Bring blocked RAM to 0
  while (ns.dnet.getBlockedRam(ip) > 0) {
    const result = await ns.dnet.memoryReallocation(ip);
    if (!result.success) {
      break;
    }
  }

  /*
    Try to potentially loot the server afterwards. This might be a bad idea, as
    this increases our RAM cost substantially (almost doubling it) and the only
    advantage to looting after this is in case we get taken offline next darknet
    cycle, since the hydra only acts at darknet cycle boundaries.
  */
  if (loot) {
      ns.spawn(LOOT_SCRIPT, { preventDuplicates: true, temporary: true, threads: 1, spawnDelay: 0 }, ip);
  }
}
