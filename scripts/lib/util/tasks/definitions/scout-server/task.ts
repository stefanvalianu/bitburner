import { NS } from "@ns";
import { scanAll, moneyMax } from "../../../serverMap";
import { BaseTask } from "../../baseTask";
import { availableHostnames } from "../../helpers";
import { ScoutTaskState, SCOUT_SERVER_TASK_ID } from "./info";

class ScoutTask extends BaseTask<ScoutTaskState> {
  constructor(ns: NS) {
    super(ns, SCOUT_SERVER_TASK_ID);
  }

  protected async run(): Promise<void> {
    const servers = scanAll(this.ns);
    const available = availableHostnames(servers);

    if (available.length === 0) {
      this.log.warn("no available servers — nothing to scout");
      this.patchState({ available: [], target: null });
      return;
    }

    const availableSet = new Set(available);
    const candidates = servers.filter((s) => availableSet.has(s.hostname));
    const target = candidates.reduce((best, s) => (moneyMax(s) > moneyMax(best) ? s : best));

    this.patchState({ available, target: target.hostname });
    this.log.info(
      `target=${target.hostname} moneyMax=${this.ns.format.number(moneyMax(target))} pool=${available.length}`,
    );
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new ScoutTask(ns).start();
}
