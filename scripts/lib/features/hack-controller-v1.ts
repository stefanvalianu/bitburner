import { NS } from "@ns";
import { createLogger, Logger } from "../util/log";
import { readAllocation } from "../util/tasks/client";
import { getScoutState } from "../util/scout";
import { Allocation } from "../util/tasks/types";

const WEAKEN_SCRIPT = "lib/util/hacks/weaken.js";
const HACK_SCRIPT = "lib/util/hacks/hack.js";
const GROW_SCRIPT = "lib/util/hacks/grow.js";

function runBatch(
  ns: NS,
  log: Logger,
  target: string,
  weakenRam: number,
  canGrow: boolean,
  growRam: number,
  canHack: boolean,
  hackRam: number,
  allocation: Allocation,
): number {
  const weakenTime = ns.getWeakenTime(target);

  for (const slice of allocation.servers) {
    const weakenThreads = Math.floor(slice.ram / weakenRam);

    const weakenAmount = ns.weakenAnalyze(weakenThreads, slice.cores);
    const pid = ns.exec(WEAKEN_SCRIPT, slice.hostname, weakenThreads, target);
    if (pid === 0) {
      log.warn(`exec ${WEAKEN_SCRIPT} failed on ${slice.hostname} (threads=${weakenThreads})`);
      continue;
    } else {
      log.info(`started ${weakenThreads} ${WEAKEN_SCRIPT} threads from ${slice.hostname}`);
    }
  }

  return weakenTime + 100;
}

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

  const hackRam = ns.getScriptRam(HACK_SCRIPT, "home");
  const weakenRam = ns.getScriptRam(WEAKEN_SCRIPT, "home");
  const growRam = ns.getScriptRam(GROW_SCRIPT, "home");

  if (hackRam === 0 || weakenRam === 0 || growRam === 0) {
    log.error(`hack/grow/weaken scripts missing`);
    return;
  }

  // first - bring the server to lowest security state (suboptimal but easy)
  if (ns.getServerSecurityLevel(TARGET) > ns.getServerMinSecurityLevel(TARGET)) {
    log.info(`preparing ${scout.target} by lowering security level...`);

    while (ns.getServerSecurityLevel(TARGET) > ns.getServerMinSecurityLevel(TARGET)) {
      const batchTime = runBatch(
        ns,
        log,
        TARGET,
        weakenRam,
        false,
        growRam,
        false,
        hackRam,
        allocation,
      );
      await ns.asleep(batchTime);
    }

    log.info(`${scout.target} prepared for growth.`);
  }

  // next, begin the server to its maximal money state while also keeping security low
  if (ns.getServerMoneyAvailable(TARGET) < ns.getServerMaxMoney(TARGET)) {
    log.info(`preparing ${scout.target} by maximizing cash...`);
  }
  // Idle until killed by the manager on rebalance. The workers keep running
  // even after this controller exits, but the manager records their PIDs and
  // will kill them too on the next tick.
  while (true) await ns.asleep(60_000);
}
