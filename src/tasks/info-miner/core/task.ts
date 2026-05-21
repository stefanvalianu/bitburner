import { NS } from "@ns";
import { BaseTask } from "@repo/common/tasks/baseTask";
import { infoMinerTask } from "@repo/tasks/info-miner/info";
import { MAIN_UX_REFRESH_INTERVAL } from "@repo/common/constants";
import { INFO_MINER_SUBSCRIPTS } from "./scripts";

class PlayerMonitorTask extends BaseTask {
  constructor(ns: NS) {
    super(ns, infoMinerTask);
  }

  protected async run_task(): Promise<void> {
    while (true) {
      if (!this.tick()) {
        return;
      }

      /*
        This task works by spawning a subscript task, which will spawn the next subscript task, etc, etc
        The order of the tasks is encoded in an array pased to each script, which shrinks every hop. Note there
        could be issues if the whole chain takes > MAIN_UX_REFRESH_INTERVAL. If that's the case, there are
        bigger performance issues to address (and we could solve it by waiting for last task to write to port)
      */
      let tasks = [...INFO_MINER_SUBSCRIPTS];
      const firstTask = tasks.shift();

      if (!firstTask) {
        this.log.error(`Unable to find a script to invoke.`);
        return;
      }

      this.ns.run(firstTask, { temporary: true }, JSON.stringify(tasks));

      await this.ns.asleep(MAIN_UX_REFRESH_INTERVAL);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new PlayerMonitorTask(ns).start();
}
