import { NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { UltrahackerTaskState, ULTRAHACKER_TASK_ID } from "./info";

class UltrahackerTask extends BaseTask<UltrahackerTaskState> {
  constructor(ns: NS) {
    super(ns, ULTRAHACKER_TASK_ID);
  }

  protected async run_task(): Promise<void> {
    // todo
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new UltrahackerTask(ns).start();
}
