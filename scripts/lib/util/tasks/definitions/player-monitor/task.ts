import { NS, Player } from "@ns";
import { BaseTask } from "../../baseTask";
import {
  PLAYER_MONITOR_FAST_REFRESH_FREQUENCY_MS,
  PLAYER_MONITOR_TASK_ID,
  PlayerMonitorTaskState,
} from "./info";
import { PLAYER_STATE_PORT } from "../../../ports";

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
      const hasFormulas = this.ns.fileExists(PN.formulas, "home");

      const state = {
        inventory: {
          hasFormulas,
          programs: allPrograms.filter(
            (p) => !portOpenerNames.has(p.name) && p.name !== PN.formulas,
          ),
          portOpeners: allPrograms.filter((p) => portOpenerNames.has(p.name)),
          hasRouter: this.ns.hasTorRouter(),
        },
        trading: {
          hasTixApi: this.ns.stock.hasTixApiAccess(),
          has4SApi: this.ns.stock.has4SDataTixApi(),
        },
        player: this.player,
      } satisfies Partial<PlayerMonitorTaskState>;

      this.patchState(state);

      // also push this to the player port that useLivePlayerState() consumes
      this.ns.clearPort(PLAYER_STATE_PORT);
      this.ns.writePort(PLAYER_STATE_PORT, JSON.stringify(state));

      await this.ns.asleep(PLAYER_MONITOR_FAST_REFRESH_FREQUENCY_MS);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new PlayerMonitorTask(ns).start();
}
