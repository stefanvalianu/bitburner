import { NS, Player } from "@ns";
import { BaseTask } from "../../baseTask";
import { PLAYER_MONITOR_TASK_ID, PlayerMonitorTaskState } from "./info";

const PORT_OPENER_KEYS = ["bruteSsh", "ftpCrack", "relaySmtp", "httpWorm", "sqlInject"] as const;

class PlayerMonitorTask extends BaseTask<PlayerMonitorTaskState> {
  private player: Player;

  constructor(ns: NS) {
    super(ns, PLAYER_MONITOR_TASK_ID);

    this.player = this.ns.getPlayer();
  }

  protected async run_task(): Promise<void> {
    while (!this.shouldShutdown) {
      this.player = this.ns.getPlayer();

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
        player: this.player,
      });

      await this.ns.asleep(10_000);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new PlayerMonitorTask(ns).start();
}
