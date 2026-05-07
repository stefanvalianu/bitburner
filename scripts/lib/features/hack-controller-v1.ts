import { NS } from "@ns";
import { createLogger } from "../util/log";
import { releaseLease, requestServer } from "../util/leaseClient";

// simple hack controller that implements basic HWGW for early-game hacking
export async function main(ns: NS): Promise<void> {
  const log = createLogger(ns, "hack-v1");

  // we need the script sizes to understand how much we can parallelize them
  const weakenRam = ns.getScriptRam("lib/hacks/weaken.js");
  const growRam = ns.getScriptRam("lib/hacks/grow.js");
  const hackRam = ns.getScriptRam("lib/hacks/hack.js");
  const ramNeeded = Math.max(weakenRam, growRam, hackRam);

  const lease = await requestServer(ns, { purpose: "hack", ramNeeded });
  if (!lease) {
    log.warn("no server available for hack lease");
    return;
  }
  log.info(`leased ${lease.hostname} (${lease.ramReserved}gb)`);

  try {
    // HWGW orchestration goes here in a follow-up. For now we just hold the
    // lease briefly so the dashboard's PID-liveness reaper has something to
    // see and the explicit-release path gets exercised.
    await ns.asleep(5_000);
  } finally {
    releaseLease(ns, lease.leaseId);
  }
}
