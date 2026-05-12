import { NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { InfiltratorTaskState, INFILTRATOR_TASK_ID } from "./info";

const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 mins

class InfiltratorTask extends BaseTask<InfiltratorTaskState> {
  constructor(ns: NS) {
    super(ns, INFILTRATOR_TASK_ID);
  }

  protected async run_task(): Promise<void> {
    while (true) {
      this.patchState({
        infiltrations: this.ns.infiltration.getPossibleLocations().map(location => this.ns.infiltration.getInfiltration(location.name)),
      });

      await this.ns.asleep(REFRESH_INTERVAL);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new InfiltratorTask(ns).start();
}
