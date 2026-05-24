import { NS } from "@ns";
import { bootstrapHydra } from "./bootstrap";

/*
  This script is used in the rare case that actionator is not spawned on home.
  It ensures we deploy hydra to the darkweb directly from the home server. Note
  this is SUPER unreliable; if other scripts are started on home at the same time,
  this script will fail (not enough RAM).
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await bootstrapHydra(ns);
}
