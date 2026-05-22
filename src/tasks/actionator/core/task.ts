import { NS } from "@ns";
import { BaseTask } from "@repo/common/tasks/baseTask";
import { ACTIONATOR_SUBSCRIPTS } from "./scripts";
import { ACTIONATOR_QUEUE_PORT } from "@repo/common/ports";
import { identifyRunnableSubscripts } from "@repo/common/tasks/subscriptHelpers";
import { actionatorTask } from "../info";

// Changing actions every 3 seconds should be plenty
const REFRESH_INTERVAL = 3000;

class ActionatorTask extends BaseTask {
  private readonly subscripts: string[];
  private readonly oneoffSubscripts: string[];

  constructor(ns: NS) {
    super(ns, actionatorTask);

    const runnables = identifyRunnableSubscripts(ns, ACTIONATOR_SUBSCRIPTS);
    this.subscripts = runnables.repeatedPaths;
    this.oneoffSubscripts = runnables.oneOffPaths;
    
    this.log.info(`Actionator running with subscripts: ${this.subscripts.join(", ")}`);
  }

  protected async run_task(): Promise<void> {
    let firstRun = true;

    while (true) {
      if (!this.tick()) {
        return;
      }

      /*
        This task works by spawning a subscript task, which will spawn the next subscript task, etc, etc
        The order of the tasks is encoded in an array pased to each script, which shrinks every hop. Note there
        could be issues if the whole chain takes > REFRESH_INTERVAL. If that's the case, there are
        bigger performance issues to address (and we could solve it by waiting for last task to write to port)
      */
      const startedAt = Date.now();
      this.ns.clearPort(ACTIONATOR_QUEUE_PORT);

      if (firstRun) {
        this.oneoffSubscripts.forEach(s => this.ns.writePort(ACTIONATOR_QUEUE_PORT, s));
        firstRun = false;
      }

      // put all the child scripts on the port queue (except the first)
      for (let i = 1; i < this.subscripts.length; i++) {
        this.ns.writePort(ACTIONATOR_QUEUE_PORT, this.subscripts[i]);
      }

      // chain is started here
      this.ns.run(this.subscripts[0], { temporary: true });

      // wait until the final script in the chain drains and writes back to the port
      await this.ns.nextPortWrite(ACTIONATOR_QUEUE_PORT);

      // compute the time taken for the chain to execute
      const timeTaken = this.ns.readPort(ACTIONATOR_QUEUE_PORT) as number - startedAt;

      // if we took more time to finish the chain than the UX refresh interval, note that
      if (timeTaken > REFRESH_INTERVAL) {
        this.log.warn(`Actionator scripts took ${timeTaken}ms to execute, which is above the main UX refresh interval of ${REFRESH_INTERVAL}ms.`);
        continue;
      }

      // try to have this update every second to maintain the UX display freshness
      await this.ns.asleep(REFRESH_INTERVAL - timeTaken);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new ActionatorTask(ns).start();
}
