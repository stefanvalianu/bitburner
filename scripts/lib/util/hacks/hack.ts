import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const targetServer = ns.args[0].toString();

  ns.disableLog("ALL");
  ns.hack(targetServer);
}
