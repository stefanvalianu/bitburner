import { NS } from "@ns";
import { createLogger, Logger } from "../util/log";
import {
  isShutdownRequested,
  patchState,
  peekMyState,
  readAllocation,
  readTaskId,
  reportChild,
} from "../util/tasks/client";
import type { HackTaskState, ScoutTaskState } from "../util/tasks/definitions";
import type { Allocation } from "../util/tasks/types";
import { peekTaskState } from "../util/tasks/types";

const WEAKEN_SCRIPT = "lib/util/hacks/weaken.js";
const HACK_SCRIPT = "lib/util/hacks/hack.js";
const GROW_SCRIPT = "lib/util/hacks/grow.js";

const SHUTDOWN_POLL_MS = 2_000;

function runWeakenBatch(
  ns: NS,
  log: Logger,
  taskId: string,
  target: string,
  weakenRam: number,
  allocation: Allocation,
): number {
  const weakenTime = ns.getWeakenTime(target);

  for (const slice of allocation.servers) {
    const weakenThreads = Math.floor(slice.ram / weakenRam);
    if (weakenThreads <= 0) continue;
    const pid = ns.exec(WEAKEN_SCRIPT, slice.hostname, weakenThreads, target);
    if (pid === 0) {
      log.warn(`exec ${WEAKEN_SCRIPT} failed on ${slice.hostname} (threads=${weakenThreads})`);
      continue;
    }
    reportChild(ns, taskId, pid, slice.hostname);
    log.info(`started ${weakenThreads} ${WEAKEN_SCRIPT} threads from ${slice.hostname}`);
  }

  return weakenTime + 100;
}

// Sleep in small chunks while watching for a shutdown request. Returns true
// if shutdown was requested during the sleep.
async function sleepWatchingShutdown(ns: NS, taskId: string, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (isShutdownRequested(ns, taskId)) return true;
    const remaining = end - Date.now();
    await ns.asleep(Math.min(SHUTDOWN_POLL_MS, remaining));
  }
  return isShutdownRequested(ns, taskId);
}

// Cooperative teardown: kill every worker we spawned (manager tracks them
// via child-spawned events but we have a fresher view of our own slot).
function teardown(ns: NS, log: Logger, taskId: string): void {
  const me = peekMyState<HackTaskState>(ns, taskId);
  const pids = me?.childPids ?? [];
  for (const pid of pids) {
    if (ns.isRunning(pid)) ns.kill(pid);
  }
  log.info(`shutdown: killed ${pids.length} worker(s)`);
}

// Hack controller (v1). Runs a fleet-wide weaken loop until either the
// target is at minimum security or the manager flags shutdownRequested.
//
// HWGW orchestration is intentionally deferred — this v1 just runs weaken
// against the scout-published target, validating the new task lifecycle
// (allocation, child reporting, cooperative shutdown).
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const log = createLogger(ns, "hack-v1");
  const taskId = readTaskId(ns);
  const allocation = readAllocation(ns);

  // Pull the desired target out of the published snapshot (scout-server's
  // slot). The manager only spawns us when scout has produced a target, but
  // bail cleanly if the port was cleared or scout's slot is empty.
  const snap = peekTaskState(ns);
  const scoutSlot = snap?.["scout-server"] as
    | (ScoutTaskState & { childPids: number[] })
    | undefined;
  const target = scoutSlot?.target ?? null;
  if (!target) {
    log.error("no scout target");
    return;
  }

  // Record the target this run was started against. Keeps needsRerun's
  // comparison stable against scout publishing the same target on later ticks.
  patchState(ns, taskId, { target } satisfies HackTaskState);

  const hackRam = ns.getScriptRam(HACK_SCRIPT, "home");
  const weakenRam = ns.getScriptRam(WEAKEN_SCRIPT, "home");
  const growRam = ns.getScriptRam(GROW_SCRIPT, "home");

  if (hackRam === 0 || weakenRam === 0 || growRam === 0) {
    log.error(`hack/grow/weaken scripts missing`);
    return;
  }

  // Bring the server to minimum security first (suboptimal but easy).
  if (ns.getServerSecurityLevel(target) > ns.getServerMinSecurityLevel(target)) {
    log.info(`preparing ${target} by lowering security level...`);

    while (ns.getServerSecurityLevel(target) > ns.getServerMinSecurityLevel(target)) {
      if (isShutdownRequested(ns, taskId)) {
        teardown(ns, log, taskId);
        return;
      }
      const batchTime = runWeakenBatch(ns, log, taskId, target, weakenRam, allocation);
      const stopped = await sleepWatchingShutdown(ns, taskId, batchTime);
      if (stopped) {
        teardown(ns, log, taskId);
        return;
      }
    }

    log.info(`${target} prepared for growth.`);
  }

  // Idle until the manager flags shutdown. Workers from the prep phase
  // (already finished) need not be tracked; future HWGW work will spawn
  // its own and call reportChild.
  while (true) {
    if (await sleepWatchingShutdown(ns, taskId, 60_000)) {
      teardown(ns, log, taskId);
      return;
    }
  }
}
