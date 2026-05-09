import { NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { PLAYER_MONITOR_TASK_ID, PlayerMonitorTaskState } from "./info";

const PORT_OPENER_KEYS = ["bruteSsh", "ftpCrack", "relaySmtp", "httpWorm", "sqlInject"] as const;

class PlayerMonitorTask extends BaseTask<PlayerMonitorTaskState> {
  constructor(ns: NS) {
    super(ns, PLAYER_MONITOR_TASK_ID);
  }

  protected async run_task(): Promise<void> {
    while (!this.shouldShutdown) {
      const PN = this.ns.enums.ProgramName;
      const portOpenerNames = new Set<string>(PORT_OPENER_KEYS.map((k) => PN[k]));
      const allPrograms = Object.values(PN).map((name) => ({
        name,
        owned: this.ns.fileExists(name, "home"),
      }));

      this.patchState({
        inventory: {
          hasFormulas: this.ns.fileExists(PN.formulas, "home"),
          programs: allPrograms.filter(
            (p) => !portOpenerNames.has(p.name) && p.name !== PN.formulas,
          ),
          portOpeners: allPrograms.filter((p) => portOpenerNames.has(p.name)),
          hasRouter: this.ns.hasTorRouter(),
        },
        stats: {
          hackingLevel: this.ns.getHackingLevel(),
        },
      });

      await this.ns.asleep(10_000);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new PlayerMonitorTask(ns).start();
}
