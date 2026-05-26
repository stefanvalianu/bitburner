import { NS } from "@ns";
import { TASK_STATE_STORED_FILE } from "./common/tasks/constants";
import { STASIS_LINK_FILE } from "./common/info/hydra";

/*
  This script is only called at the beginning of a new run. It's mainly responsible for
  clearing the task state which is otherwise preserved during a run. During a run, when uising
  main.js as the entrypoint, the tasks which were previously started are re-issued at startup,
  to make script deployments a bit easier.
*/
export async function main(ns: NS): Promise<void> {
  // clear existing task prefs
  ns.rm(TASK_STATE_STORED_FILE, "home");
  ns.rm(STASIS_LINK_FILE, "home");

  ns.spawn("main.js", { spawnDelay: 0, temporary: true });
}