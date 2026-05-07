import { NS } from "@ns";
import { createLogger } from "../util/log";
import { readAllocation, reportChild } from "../util/tasks/client";
import { getScoutState } from "../util/scout";

const WORKER_SCRIPT = "lib/util/hacks/weaken.js";

// Hack controller (v1). Receives an Allocation from the server manager via
// ns.args[0]. For each allocated host: compute how many threads fit, exec,
// and report the spawned PID upstream so the manager can kill the whole tree
// on rebalance. Then idles until killed externally.
//
// HWGW orchestration is intentionally deferred — this v1 just runs weaken
// fleet-wide, validating the allocation/spawn/reporting plumbing end-to-end.
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const log = createLogger(ns, "hack-v1");
  const allocation = readAllocation(ns);

  // Defensive: priority gate should already have prevented us from spawning
  // without a scout target, but bail cleanly if the port was cleared between
  // the priority check and exec.
  const scout = getScoutState(ns);
  if (!scout?.target) {
    log.error("no scout target");
    return;
  }
  const TARGET = scout.target;

  const workerRam = ns.getScriptRam(WORKER_SCRIPT, "home");
  if (workerRam === 0) {
    log.error(`worker script not found: ${WORKER_SCRIPT}`);
    return;
  }

  let totalThreads = 0;
  for (const slice of allocation.servers) {
    const threads = Math.floor(slice.ram / workerRam);
    if (threads <= 0) continue;
    const pid = ns.exec(WORKER_SCRIPT, slice.hostname, threads, TARGET);
    if (pid === 0) {
      log.warn(`exec failed on ${slice.hostname} (threads=${threads})`);
      continue;
    } else {
      log.info(`started ${threads} threads from ${slice.hostname}`);
    }
    //reportChild(ns, allocation.taskId, pid, slice.hostname);
    totalThreads += threads;
  }
  log.info(`started ${totalThreads} threads across ${allocation.servers.length} hosts → ${TARGET}`);

  // Idle until killed by the manager on rebalance. The workers keep running
  // even after this controller exits, but the manager records their PIDs and
  // will kill them too on the next tick.
  while (true) await ns.asleep(60_000);
}
