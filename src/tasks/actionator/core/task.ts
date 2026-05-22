import { NS } from "@ns";
import { BaseTask } from "@repo/common/tasks/baseTask";
import { ACTIONATOR_SUBSCRIPTS } from "./scripts";
import { ACTIONATOR_QUEUE_PORT } from "@repo/common/ports";
import { actionatorTask } from "@repo/tasks/actionator/info";
import { identifyRunnableSubscripts } from "./helpers";
import { MAIN_UX_REFRESH_INTERVAL } from "@repo/common/constants";

const FAST_REFRESH_INTERVAL = MAIN_UX_REFRESH_INTERVAL;
const SLOW_REFRESH_INTERVAL = 3000;

class ActionatorTask extends BaseTask {
  private readonly oneOffScripts: string[];
  private readonly fastScripts: string[];
  private readonly slowScripts: string[];

  constructor(ns: NS) {
    super(ns, actionatorTask);

    const runnables = identifyRunnableSubscripts(ns, ACTIONATOR_SUBSCRIPTS);
    this.oneOffScripts = [];
    this.fastScripts = [];
    this.slowScripts = [];

    runnables.forEach(subscript => {
      if (subscript.repeat === "fast") this.fastScripts.push(subscript.scriptPath);
      else if (subscript.repeat === "slow") this.slowScripts.push(subscript.scriptPath);
      else if (subscript.repeat === "none") this.oneOffScripts.push(subscript.scriptPath);
      else this.log.error(`Unhandled subscript`, subscript);
    });

    this.log.info(`Actionator running with ${runnables.length} subscripts.`);
  }

  /*
    This task works by spawning a subscript task, which will spawn the next subscript task, etc, etc
    The order of the tasks is encoded in an array pased to each script, which shrinks every hop. Note there
    could be issues if the whole chain takes fills up the port. If that's the case, there are
    bigger performance issues to address
  */
  protected async run_task(): Promise<void> {
    let lastFastRun: number = 0;
    let lastSlowRun: number = 0;

    while (true) {
      if (!this.tick()) {
        return;
      }

      // on the first loop, queue the one-run subscripts
      if (lastFastRun === 0 && lastSlowRun === 0) {
        this.oneOffScripts.forEach(s => this.ns.writePort(ACTIONATOR_QUEUE_PORT, s));
      }
      
      const now = Date.now();
      let scriptsToQueue: string[] = [];

      if (now > lastFastRun + FAST_REFRESH_INTERVAL) {
        // overdue for a fast run
        scriptsToQueue.push(...this.fastScripts);
        lastFastRun = now;
      }

      if (now > lastSlowRun + SLOW_REFRESH_INTERVAL) {
        // overdue for a slow run
        scriptsToQueue.push(...this.slowScripts);
        lastSlowRun = now;    
      }

      if (scriptsToQueue.length > 0) {
        // put all the child scripts on the port queue (except the first)
        for (let i = 1; i < scriptsToQueue.length; i++) {
          this.ns.writePort(ACTIONATOR_QUEUE_PORT, scriptsToQueue[i]);
        }

        // chain is started here
        this.ns.run(scriptsToQueue[0], { temporary: true });
      }

      await this.ns.asleep(FAST_REFRESH_INTERVAL);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new ActionatorTask(ns).start();
}
