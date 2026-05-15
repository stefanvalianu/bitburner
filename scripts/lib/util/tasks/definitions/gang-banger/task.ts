import { FactionName, GangGenInfo, NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { GANG_BANGER_TASK_ID, GangBangerTaskState, GangMember } from "./info";
import { pickRandomGangMemberName } from "./names";
import { syncToTerritoryPowerUpdate } from "./cycleTracking";

// how long to sleep if we don't have a gang yet
const SLEEP_INTERVAL_WITHOUT_GANG = 30_000;

// Slum Snakes rule! 
const GANG_FACTION: FactionName = "Slum Snakes";

// Task to manage adding gang power during clashges
const TERRITORY_WARFARE_TASK = "Territory Warfare";

class GangBangerTask extends BaseTask<GangBangerTaskState> {
  private members: GangMember[];
  private gang: GangGenInfo | undefined;

  constructor(ns: NS) {
    super(ns, GANG_BANGER_TASK_ID);
    
    this.members = [];

    this.gang = this.ns.gang.inGang() ? ns.gang.getGangInformation() : undefined;
  }

  protected async run_task(): Promise<void> {
    await this.waitUntilInGang();

    // sync to the war clock
    let lastProcessedCycles = await syncToTerritoryPowerUpdate(this.ns);
    let cyclesSinceTerritoryPowerUpdate = 0;

    let inWarWindow = false;

    while (true) {
      if (this.shouldShutdown) {
        return;
      }

      this.ns.formulas.gang.ascensionMultiplier()
      this.ns.formulas.gang.ascensionPointsGain()
      this.ns.formulas.gang.moneyGain()
      this.ns.formulas.gang.respectGain()
      this.ns.formulas.gang.wantedLevelGain()
      this.ns.formulas.gang.wantedPenalty()

      this.ns.gang.getEquipmentNames();
      this.ns.gang.getEquipmentCost() // maybe dont need (?)

      // when creating a gang, find the best option we can have. sorry slum snakes
      this.ns.gang.getAllGangInformation
      this.ns.gang.createGang();
      this.ns.gang.getGangInformation()

      // always recruit if we can
      this.recruitIfPossible();

      this.ns.gang.nextUpdate()

      this.ns.gang.getBonusTime();

      this.ns.gang.getChanceToWinClash
      this.ns.gang.getEquipmentNames()
      this.ns.gang.getEquipmentCost

      this.ns.gang.setTerritoryWarfare()
      this.ns.gang.setMemberTask()
      this.ns.gang.respectForNextRecruit() // maybe dont use
      this.ns.gang.purchaseEquipment

      await this.ns.asleep(10_000);
    }
  }
  
  private setAllMembersToTask(ns: NS, taskName: string): void {
    for (const member of this.members) {
      ns.gang.setMemberTask(member.name, taskName);
    }
  }

  private recruitIfPossible() {
    if (this.ns.gang.canRecruitMember()) {
      const name = `${pickRandomGangMemberName()} ${this.members.length + 1}`;
      if (this.ns.gang.recruitMember(name)) {
        this.members.push({
          ...this.ns.gang.getMemberInformation(name),
          rank: "I"
        } satisfies GangMember);
      }
    }
  }

  // special loop until we can actually form a gang
  private async waitUntilInGang(): Promise<void> {
    while (!this.ns.gang.inGang()) {
      if (this.shouldShutdown) {
        return;
      }

      // try to create a gang
      if (this.ns.gang.createGang(GANG_FACTION)) {
        this.gang = this.ns.gang.getGangInformation();
        break;
      }

      await this.ns.asleep(SLEEP_INTERVAL_WITHOUT_GANG);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new GangBangerTask(ns).start();
}
