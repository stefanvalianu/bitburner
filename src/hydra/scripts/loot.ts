import { NS } from "@ns";
import { loot } from "@repo/hydra/loot-helpers";
import { PHISH_SCRIPT } from "@repo/hydra/types";
import { getMaxPossibleThreads } from "../thread-helper";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const ip = ns.getIP();

  // loot the server - we chain to this from reclaim, since reclaiming can create loot pretty consistently
  loot(ns, ip);

  const threads = getMaxPossibleThreads(ns, ip, 0, PHISH_SCRIPT);

  if (threads > 0) {
    ns.spawn(PHISH_SCRIPT, { preventDuplicates: true, temporary: true, threads: threads, spawnDelay: 0 });
  }
}
