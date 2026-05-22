import { FactionName, NS } from "@ns";
import { BaseTask } from "@repo/common/tasks/baseTask";
import { continueOrFightWar, MemberTasks, syncToTerritoryPowerUpdate } from "./warTracking";
import { assignOptimalGangTasks } from "./taskSelection";
import { gangBangerTask } from "@repo/tasks/gang-banger/info";
import { GANG_INFO_PORT, getPortData, USER_PREFERENCES_PORT } from "@repo/common/ports";
import { UserPreferences } from "@repo/common/preferences";
import { GangInfo } from "@repo/common/info/gangInfo";

// Slum Snakes rule!
export const GANG_FACTION: FactionName = "Slum Snakes";

class GangBangerTask extends BaseTask {
  constructor(ns: NS) {
    super(ns, gangBangerTask);
  }

  protected async run_task(): Promise<void> {
    // we should keep waiting and trying to join a gang before continuing 
    await this.waitUntilGangCreated();

    // sync to the war clock
    let lastProcessedCycles = await syncToTerritoryPowerUpdate(this.ns);
    let cyclesSinceTerritoryPowerUpdate = 0;

    let inWarWindow = false;
    let preWarTasks: MemberTasks | undefined = undefined;

    while (true) {
      if (!this.tick()) {
        return;
      }

      const gangInfo = getPortData<GangInfo>(this.ns, GANG_INFO_PORT);
      const members = gangInfo?.members ?? [];
      const territory = gangInfo?.territory ?? 0;

      // set members to their optimal tasks
      assignOptimalGangTasks(this.ns, members);

      if (territory === 1) {
        // we own all the land, peace on earth
        // We should probably quit the task here since from here on we're just going to stay on the same tasks
        await this.ns.asleep(10_000);
      } else {
        const userPreferences = getPortData<UserPreferences>(this.ns, USER_PREFERENCES_PORT);

        // track stuff for managing territory warfare.
        // for the most part, this part is responsible for
        // blocking until the next tick and continuing like
        // normal, or if we're in a war window, ensuring that
        // we set members to territory warfare, waiting for
        // the war tick, then setting them back to their
        // previous tasks. NOTE this is also responsible for
        // enabling clashes when the chance to win is high
        // enough
        const warCycleUpdate = await continueOrFightWar(
          this.ns,
          lastProcessedCycles,
          cyclesSinceTerritoryPowerUpdate,
          inWarWindow,
          preWarTasks,
          userPreferences?.gangClashWinThreshold,
        );
        lastProcessedCycles = warCycleUpdate.lastProcessedCycles;
        cyclesSinceTerritoryPowerUpdate = warCycleUpdate.cyclesSinceTerritoryPowerUpdate;
        inWarWindow = warCycleUpdate.inWarWindow;
        preWarTasks = warCycleUpdate.preWarTasks;
      }
    }
  }

  private async waitUntilGangCreated(): Promise<void> {
    let gangInfo = getPortData<GangInfo>(this.ns, GANG_INFO_PORT);
    let inGang = gangInfo?.hasGang ?? false;

    while (!inGang) {
      if (!this.tick()) {
        // we need an immediate exit here before the script continues
        this.ns.exit();
      }

      gangInfo = getPortData<GangInfo>(this.ns, GANG_INFO_PORT);
      inGang = gangInfo?.hasGang ?? false;

      this.ns.gang.createGang(GANG_FACTION);
      await this.ns.asleep(10_000);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new GangBangerTask(ns).start();
}
