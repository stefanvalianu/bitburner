import { NS } from "@ns";
import { createLogger } from "../util/log";
import { patchState, readTaskId } from "../util/tasks/client";
import { availableHostnames, type ScoutTaskState } from "../util/tasks/definitions";
import { moneyMax, scanAll } from "../util/serverMap";

// scout-server (v1). Picks the available server with the highest moneyMax
// and patches its own task-state slot with {target, available}. One-shot:
// returns immediately so the manager reaps the PID; next-tick needsRerun is
// false until the available-set changes again.
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const log = createLogger(ns, "scout");
  const taskId = readTaskId(ns);

  const servers = scanAll(ns);
  const available = availableHostnames(servers);
  if (available.length === 0) {
    log.warn("no available servers — nothing to scout");
    patchState(ns, taskId, { available: [], target: null } satisfies ScoutTaskState);
    return;
  }

  const availableSet = new Set(available);
  const candidates = servers.filter((s) => availableSet.has(s.hostname));
  const target = candidates.reduce((best, s) => (moneyMax(s) > moneyMax(best) ? s : best));

  patchState(ns, taskId, {
    available,
    target: target.hostname,
  } satisfies ScoutTaskState);
  log.info(
    `target=${target.hostname} moneyMax=${ns.format.number(moneyMax(target))} pool=${available.length}`,
  );
}
