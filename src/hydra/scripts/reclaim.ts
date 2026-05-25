import { NS } from "@ns";
import { LOOT_SCRIPT } from "@repo/hydra/types";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  // Bring blocked RAM to 0
  while (ns.dnet.getBlockedRam() > 0) {
    const result = await ns.dnet.memoryReallocation();
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
  ns.spawn(LOOT_SCRIPT, { preventDuplicates: true, temporary: true, threads: 1, spawnDelay: 0 });
}
