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

  // Gets the % that a skill is at the next level, from 0 to 1. Needs formulas.exe,
  // otherwise this cannot be computed and we return 0. TODO move this to UX only
  /*private getSkillProgressPercentage(skill: TrainableSkill): number {
    if (!this.hasFormulas()) {
      return 0;
    }

type TrainableSkill = "hacking" | "strength" | "defense" | "dexterity" | "agility" | "charisma";
    const currentLevel = this.player.skills[skill];
    const currentExp = this.player.exp[skill];
    const skillMult = this.player.mults[skill];

    const currentLevelExp = this.ns.formulas.skills.calculateExp(currentLevel, skillMult);

    const nextLevelExp = this.ns.formulas.skills.calculateExp(currentLevel + 1, skillMult);

    const progress = (currentExp - currentLevelExp) / (nextLevelExp - currentLevelExp);

    return Math.max(0, Math.min(1, progress));
  }*/
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new PlayerMonitorTask(ns).start();
}
