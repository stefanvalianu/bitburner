import { NS } from "@ns";

// Instead of checking for absolute min/max, we apply this factor
// to lazily attempt overutilizing weakens/grows
const PRECISION_BUFFER_MULTIPLIER = 0.9;

const HACK_SCRIPT = "lib/util/script/hack.js";
const GROW_SCRIPT = "lib/util/script/grow.js";
const WEAKEN_SCRIPT = "lib/util/script/weaken.js";

// The purpose of this script is to be deployed on a "target" machine
// and invoked. When running, this script essentially serves as a simple
// self-controller for VERY simply hacking itself. It will aim to use
// the maximum resources of the server it's running on (other than the
// ones reserved by this script) to do weaken -> grow -> weaken -> hack
// phases with maximal threads. No intelligent batching or scheduling
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const minSecurity = ns.getServerMinSecurityLevel() * (2 - PRECISION_BUFFER_MULTIPLIER);
  const maxMoney = ns.getServerMaxMoney() * PRECISION_BUFFER_MULTIPLIER;

  const usableRam = ns.getServerMaxRam() - ns.getScriptRam("lib/util/script/simple-self-hack.js");
  const growRam = ns.getScriptRam(GROW_SCRIPT);
  const hackRam = ns.getScriptRam(HACK_SCRIPT);
  const weakenRam = ns.getScriptRam(WEAKEN_SCRIPT);

  // sanity check - can we run a weak, grow, and hack independently? if not there's no point
  if (usableRam - Math.max(growRam, hackRam, weakenRam) <= 0) {
    ns.print(
      "ERROR",
      ` Machine doesn't have enough RAM to run necessary scripts. Usable RAM: ${usableRam}`,
    );
    return;
  }

  while (true) {
    let delay = 1000;
    const serverSecurity = ns.getServerSecurityLevel();
    const serverMoney = ns.getServerMoneyAvailable();

    if (serverSecurity > minSecurity) {
      // we are weakening
      const availableThreads = Math.floor(usableRam / weakenRam);
      if (availableThreads > 0) {
        ns.print("INFO", " Weakening...");
        delay = Math.max(ns.getWeakenTime());
        ns.run(WEAKEN_SCRIPT, availableThreads);
      }
    } else if (serverMoney < maxMoney) {
      // we are growing
      const availableThreads = Math.floor(usableRam / growRam);
      if (availableThreads > 0) {
        ns.print("INFO", " Growing...");
        delay = Math.max(ns.getGrowTime());
        ns.run(GROW_SCRIPT, availableThreads);
      }
    } else {
      // we are hacking
      const availableThreads = Math.floor(usableRam / hackRam);
      if (availableThreads > 0) {
        ns.print("INFO", " Hacking...");
        delay = Math.max(ns.getHackTime());
        ns.run(HACK_SCRIPT, availableThreads);
      }
    }

    // add a small buffer to ensure the scripts finish
    ns.print(
      "INFO",
      ` Server security: ${serverSecurity}/${minSecurity}, Money: ${serverMoney}/${maxMoney}`,
    );
    await ns.asleep(delay + 50);
  }
}
