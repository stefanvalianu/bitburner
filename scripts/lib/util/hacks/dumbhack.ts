import { NS } from "@ns";

// super simple hack that we'll use in the very beginning of the game to inefficiently extract money from servers. used before we have the resources to spin up a proper controller.
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const minSecurityWithBuffer = ns.getServerMinSecurityLevel() * 1.1;
  const maxMoneyWithBuffer = ns.getServerMaxMoney() * 0.95;

  while (true) {
    if (ns.getServerSecurityLevel() > minSecurityWithBuffer) {
      await ns.weaken();
    } else if (ns.getServerMoneyAvailable() < maxMoneyWithBuffer) {
      await ns.grow();
    } else {
      ns.hack();
    }
  }
}
