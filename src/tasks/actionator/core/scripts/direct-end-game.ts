import { NS } from "@ns";
import { getPortData, USER_PREFERENCES_PORT } from "@repo/common/ports";
import { UserPreferences } from "@repo/common/preferences";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

/*
  This script is responsible for:
  - Destroying the w0rld d3mon and jumping into the next configured BN
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));

  const userPreferences = getPortData<UserPreferences>(ns, USER_PREFERENCES_PORT);
  const nextBn = userPreferences?.nextBitNode ?? 12;

  ns.singularity.destroyW0r1dD43m0n(nextBn, "bootstrap.js");
}
