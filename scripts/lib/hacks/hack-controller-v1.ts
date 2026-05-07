import { NS } from "@ns";

// super simple hack controller that implements basic HWGW for early-game hacking
export async function main(ns: NS): Promise<void> {
  const minSecurityWithBuffer = ns.getServerMinSecurityLevel();
  const weakenRam = ns.getScriptRam("lib/hacks/weaken.js");
  const growRam = ns.getScriptRam("lib/hacks/grow.js");
  const hackRam = ns.getScriptRam("lib/hacks/hack.js");
}
