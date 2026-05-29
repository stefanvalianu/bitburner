import { NS } from "@ns";
import { loot } from "../loot-helper";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const ip = ns.args[0] as string;
  const listFiles = ns.args[1] as boolean;
  
  loot(ns, ip, listFiles);
}
