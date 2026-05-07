import { NS } from "@ns";
import { createLogger } from "../util/log";
import { readAllocation } from "../util/tasks/client";
import { moneyMax, scanAll } from "../util/serverMap";
import { availableHostnames, setScoutState } from "../util/scout";

// scout-server (v1). Picks the available server with the highest moneyMax and
// publishes {target, available[]} on SCOUT_PORT for downstream tasks (hack)
// and for our own change-detection on the next tick. One-shot: returns
// immediately so the manager reaps it; next-tick priority is 0 until the
// available-set changes again.
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const log = createLogger(ns, "scout");
  readAllocation(ns);

  const servers = scanAll(ns);
  const available = availableHostnames(servers);
  if (available.length === 0) {
    log.warn("no available servers — nothing to scout");
    return;
  }

  const availableSet = new Set(available);
  const candidates = servers.filter((s) => availableSet.has(s.hostname));
  const target = candidates.reduce((best, s) => (moneyMax(s) > moneyMax(best) ? s : best));

  setScoutState(ns, { target: target.hostname, available });
  log.info(
    `target=${target.hostname} moneyMax=${ns.format.number(moneyMax(target))} pool=${available.length}`,
  );
}
