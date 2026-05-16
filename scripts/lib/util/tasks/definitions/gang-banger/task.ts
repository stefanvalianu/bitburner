import { FactionName, GangMemberInfo, NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { GANG_BANGER_TASK_ID, GangBangerTaskState, GangMember, MemberRank } from "./info";
import { pickRandomGangMemberName } from "./names";
import { continueOrFightWar, MemberTasks, syncToTerritoryPowerUpdate } from "./warTracking";

// how long to sleep if we don't have a gang yet
const SLEEP_INTERVAL_WITHOUT_GANG = 30_000;

// At rank I, we ascend every 1.6 multiplier
// At rank II, we ascend every 1.26 multiplier
// At rank III, we ascend every 1.15 multiplier
// At rank 4 we only ascend every 1.5 because we 
// want to minimize ascensions and keep the members
// stable.
const ASC_MULTS: Record<MemberRank, number> = {
  "I": 1.6,
  "II": 1.26,
  "III": 1.15,
  "IV": 1.5
}

// Slum Snakes rule! 
const GANG_FACTION: FactionName = "Slum Snakes";

class GangBangerTask extends BaseTask<GangBangerTaskState> {
  constructor(ns: NS) {
    super(ns, GANG_BANGER_TASK_ID);
  }

  protected async run_task(): Promise<void> {
    await this.waitUntilInGang();

    // sync to the war clock
    let lastProcessedCycles = await syncToTerritoryPowerUpdate(this.ns);
    let cyclesSinceTerritoryPowerUpdate = 0;

    let inWarWindow = false;
    let preWarTasks: MemberTasks | undefined = undefined;

    while (true) {
      if (this.shouldShutdown) {
        return;
      }

      // we always want to recruit if possible
      this.recruitIfPossible();

      // build a member map that we'll use to identify best actions
      const members: Record<string, GangMember> = Object.fromEntries(
        this.ns.gang.getMemberNames().map(name => {
          const memberInfo = this.ns.gang.getMemberInformation(name);
          const member = {
            ...memberInfo,
            rank: this.getMemberRank(memberInfo)
          } as GangMember;

          return [name, member];
        })
      );

      // perform appropriate ascensions
      this.ascendEligibleMembers(members);

      // purchase gear for members
      this.purchaseGearForMembers(members);

      // set members to their optimal tasks
      this.assignOptimalTasks(members);

      // we only care about presenting non-warfare info
      this.patchState({
        members: Object.values(members),
        gang: this.ns.gang.getGangInformation(),
      });

      // track stuff for managing territory warfare.
      // for the most part, this part is responsible for
      // blocking until the next tick and continuing like 
      // normal, or if we're in a war window, ensuring that
      // we set members to territory warfare, waiting for 
      // the war tick, then setting them back to their
      // previous tasks. NOTE this is also responsible for 
      // enabling clashes when the chance to win is high
      // enough
      const warCycleUpdate = await continueOrFightWar(this.ns, lastProcessedCycles, cyclesSinceTerritoryPowerUpdate, inWarWindow, preWarTasks);
      lastProcessedCycles = warCycleUpdate.lastProcessedCycles;
      cyclesSinceTerritoryPowerUpdate = warCycleUpdate.cyclesSinceTerritoryPowerUpdate;
      inWarWindow = warCycleUpdate.inWarWindow;
      preWarTasks = warCycleUpdate.preWarTasks;
    }
  }

  private doStuff(): void {
    /*
    this.ns.formulas.gang.ascensionMultiplier()
    this.ns.formulas.gang.ascensionPointsGain()
    this.ns.formulas.gang.moneyGain()
    this.ns.formulas.gang.respectGain()
    this.ns.formulas.gang.wantedLevelGain()
    this.ns.formulas.gang.wantedPenalty()

    this.ns.gang.getEquipmentNames();
    this.ns.gang.getEquipmentCost() // maybe dont need (?)

    this.ns.gang.getEquipmentNames()
    this.ns.gang.getEquipmentCost

    this.ns.gang.setMemberTask()
    this.ns.gang.purchaseEquipment()*/
  }

  private recruitIfPossible(): void {
    if (this.ns.gang.canRecruitMember()) {
      this.ns.gang.recruitMember(pickRandomGangMemberName(this.ns));
    }
  }

  private ascendEligibleMembers(members: Record<string, GangMember>): void {
    for (const [memberName, member] of Object.entries(members)) {
      const newAscensionMultiplier = this.getMemberAscensionMultiplierGained(member);

      if (newAscensionMultiplier >= ASC_MULTS[member.rank]) {
        //ascend this member
        this.ns.gang.ascendMember(memberName);
        
        const newMember = this.ns.gang.getMemberInformation(memberName);
        members[memberName] = {
          ...newMember,
          rank: this.getMemberRank(newMember)
        }
      }
    }

    this.ns.formulas.gang.ascensionPointsGain()
    this.ns.gang.getAscensionResult()
  }

  private purchaseGearForMembers(members: Record<string, GangMember>): void {
  }

  private assignOptimalTasks(members: Record<string, GangMember>): void {

  }

  // special loop until we can actually form a gang
  private async waitUntilInGang(): Promise<void> {
    while (!this.ns.gang.inGang()) {
      if (this.shouldShutdown) return;

      // try to create a gang
      if (this.ns.gang.createGang(GANG_FACTION)) return;

      await this.ns.asleep(SLEEP_INTERVAL_WITHOUT_GANG);
    }
  }

  private getMemberRank(member: GangMemberInfo): MemberRank {
    // rank is checked by measuring the average combat ascension
    // multipliers vs static thresholds (described in `info.ts`)
    const ascensionMult = this.getMemberAscensionMultiplier(member);
    if (ascensionMult < 6) return "I";
    if (ascensionMult < 16) return "II";
    if (ascensionMult < 32) return "III";
    return "IV";
  }

  private getMemberAscensionMultiplier(member: GangMemberInfo): number {
    return Math.min(
      member.agi_asc_mult,
      member.def_asc_mult, 
      member.dex_asc_mult, 
      member.hack_asc_mult
    );
  }

  private getMemberAscensionMultiplierGained(member: GangMemberInfo): number {
    const multGains = this.ns.gang.getAscensionResult(member.name);

    if (!multGains) return 1;

    return Math.min(
      multGains.str,
      multGains.def,
      multGains.dex,
      multGains.agi,
    );
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new GangBangerTask(ns).start();
}
