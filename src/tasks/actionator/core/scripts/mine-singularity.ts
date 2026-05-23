import { NS } from "@ns";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

/*
  This script is responsible for:
  - Updating the state of the player, their actions, etc
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));
}
