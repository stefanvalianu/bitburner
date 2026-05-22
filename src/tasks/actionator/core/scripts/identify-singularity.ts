import { NS } from "@ns";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

/*
  This script is responsible for:
  - Producing the list of available augmentations, their sources, etc
  - Producing the list of available companies and jobs (filtering to important ones)
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  invokeNextScript(ns);
}
