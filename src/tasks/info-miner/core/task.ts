import { NS } from "@ns";
import { BaseTask } from "@repo/common/tasks/baseTask";
import { infoMinerTask } from "@repo/tasks/info-miner/info";
import { MAIN_UX_REFRESH_INTERVAL } from "@repo/common/constants";
import { INFO_MINER_SUBSCRIPTS } from "./scripts";
import { INFO_MINER_QUEUE_PORT } from "@repo/common/ports";

class PlayerMonitorTask extends BaseTask {
  private readonly subscripts: string[];
  private readonly oneoffSubscripts: string[];

  constructor(ns: NS) {
    super(ns, infoMinerTask);

    const sourceFiles = this.ns.getResetInfo().ownedSF;
    this.subscripts = [];
    this.oneoffSubscripts = [];

    for (const subscript of INFO_MINER_SUBSCRIPTS) {
      // figure out which scripts we actually want to run based on source file availability
      if (subscript.requirement) {
        if (!sourceFiles.has(subscript.requirement.sourceFile)) continue;
        if (sourceFiles.get(subscript.requirement.sourceFile)! < subscript.requirement.level) continue;
      }

      subscript.repeated ? 
        this.subscripts.push(subscript.scriptPath) :
        this.oneoffSubscripts.push(subscript.scriptPath);
    }
    
    this.log.info(`Info miner running with subscripts: ${this.subscripts.join(", ")}`);
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
      const startedAt = new Date().getTime();
      this.ns.clearPort(INFO_MINER_QUEUE_PORT);

      // put all the child scripts on the port queue (except the first)
      for (let i = 1; i < this.subscripts.length; i++) {
        this.ns.writePort(INFO_MINER_QUEUE_PORT, this.subscripts[i]);
      }

      // chain is started here
      this.ns.run(this.subscripts[0], { temporary: true });

      // wait until the final script in the chain drains and writes back to the port
      await this.ns.nextPortWrite(INFO_MINER_QUEUE_PORT);

      // compute the time taken for the chain to execute
      const timeTaken = this.ns.readPort(INFO_MINER_QUEUE_PORT) as number - startedAt;

      // if we took more time to finish the chain than the UX refresh interval, note that
      if (timeTaken > MAIN_UX_REFRESH_INTERVAL) {
        this.log.warn(`Info miner scripts took ${timeTaken}ms to execute, which is above the main UX refresh interval of ${MAIN_UX_REFRESH_INTERVAL}ms.`);
        continue;
      }

      // try to have this update every second to maintain the UX display freshness
      await this.ns.asleep(MAIN_UX_REFRESH_INTERVAL - timeTaken);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new PlayerMonitorTask(ns).start();
}
