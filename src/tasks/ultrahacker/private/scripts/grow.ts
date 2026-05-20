import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  const targetServer = ns.args.length > 0 ? ns.args[0].toString() : undefined;
  const additionalMsec = ns.args.length > 1 ? (ns.args[1] as number) : undefined;

  ns.disableLog("ALL");
  await ns.grow(targetServer, { additionalMsec: additionalMsec });
}
