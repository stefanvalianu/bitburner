import { NS } from "@ns";
import { HACK_SCRIPT } from "./constants";

// The purpose of this script is to be deployed on a "target" machine
// and invoked. When running, this script essentially serves as a simple
// self-controller for VERY simply hacking itself. It will aim to use
// the maximum resources of the server it's running on (other than the
// ones reserved by this script) to do weaken -> grow -> weaken -> hack
// phases with maximal threads. No intelligent batching or scheduling
// NOTE: this sucks a LOT, it takes forever to make a machine ready
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const usableRam = ns.getServerMaxRam() - ns.getScriptRam("lib/util/script/simple-self-hack.js");
  const hackRam = ns.getScriptRam(HACK_SCRIPT);

  // sanity check - can we run a weak, grow, and hack independently? if not there's no point
  if (usableRam - hackRam <= 0) {
    ns.print(
      "ERROR",
      ` Machine doesn't have enough RAM to run necessary scripts. Usable RAM: ${usableRam}`,
    );
    return;
  }

  while (true) {
    let delay = 1000;

    const availableThreads = Math.floor(usableRam / hackRam);
    if (availableThreads > 0) {
      ns.print("INFO", " Hacking...");
      delay = Math.max(ns.getHackTime());
      ns.run(HACK_SCRIPT, availableThreads);
    }

    await ns.asleep(delay + 20);
  }
}
