import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const targetServer = ns.args.length > 0 ? ns.args[0].toString() : undefined;

  ns.disableLog("ALL");
  await ns.grow(targetServer);
}
