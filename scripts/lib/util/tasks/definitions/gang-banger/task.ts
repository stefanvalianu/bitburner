import { FactionName, GangMemberInfo, NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { GANG_BANGER_TASK_ID, GangBangerTaskState, GangMember, MemberRank } from "./info";
import { pickRandomGangMemberName } from "./names";
import { continueOrFightWar, MemberTasks, syncToTerritoryPowerUpdate } from "./warTracking";
import { getPlayerMonitorState } from "../player-monitor/info";
import { assignOptimalGangTasks } from "./taskSelection";

// how long to sleep if we don't have a gang yet
const SLEEP_INTERVAL_WITHOUT_GANG = 30_000;

// Each "cycle" allow us to use 15% of our budget to
// purchase equipment for members of rank II and
// above.
const PERCENTAGE_OF_BUDGET_TO_SPEND_ON_EQUIPMENT = 0.15;

// At rank I, we ascend every 1.6 multiplier
// At rank II, we ascend every 1.26 multiplier
// At rank III, we ascend every 1.15 multiplier
// At rank 4 we only ascend every 1.5 because we
// want to minimize ascensions and keep the members
// stable.
const ASC_MULTS: Record<MemberRank, number> = {
  1: 1.6,
  2: 1.26,
  3: 1.15,
  4: 1.5,
};

// Slum Snakes rule!
export const GANG_FACTION: FactionName = "Slum Snakes";

class GangBangerTask extends BaseTask<GangBangerTaskState> {
  // Equipment that persists. Something to prioritize for all members
  private readonly augmentationsNames: string[];

  // Equipment that gets reset on ascension
  private readonly normalEquipmentNames: string[];

  constructor(ns: NS) {
    super(ns, GANG_BANGER_TASK_ID);

    this.augmentationsNames = [];
    this.normalEquipmentNames = [];

    // Create the equipment list
    const equipmentNames = this.ns.gang.getEquipmentNames();
    for (const equipmentName of equipmentNames) {
      const type = this.ns.gang.getEquipmentType(equipmentName);
      const stats = this.ns.gang.getEquipmentStats(equipmentName);

      // skip equipment with irrelevant stats
      if (!stats.str && !stats.def && !stats.agi && !stats.dex) continue;

      if (type === "Augmentation") {
        this.augmentationsNames.push(equipmentName);
      } else {
        this.normalEquipmentNames.push(equipmentName);
      }
    }
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
      this.tryRecruitMembers();

      // create a helper list of members that we'll update throughout below steps
      const members = this.getMembers();

      // perform appropriate ascensions (not just before a war)
      if (!inWarWindow) {
        this.ascendEligibleMembers(members);
      }

      // purchase gear for members
      this.purchaseGearForMembers(members);

      // set members to their optimal tasks
      assignOptimalGangTasks(this.ns, members);

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
      const warCycleUpdate = await continueOrFightWar(
        this.ns,
        lastProcessedCycles,
        cyclesSinceTerritoryPowerUpdate,
        inWarWindow,
        preWarTasks,
        this.snapshot?.preferences?.gangClashWinThreshold,
      );
      lastProcessedCycles = warCycleUpdate.lastProcessedCycles;
      cyclesSinceTerritoryPowerUpdate = warCycleUpdate.cyclesSinceTerritoryPowerUpdate;
      inWarWindow = warCycleUpdate.inWarWindow;
      preWarTasks = warCycleUpdate.preWarTasks;
    }
  }

  private tryRecruitMembers(): void {
    if (this.ns.gang.canRecruitMember()) {
      this.ns.gang.recruitMember(pickRandomGangMemberName(this.ns));
    }
  }

  private ascendEligibleMembers(members: Record<string, GangMember>): void {
    for (const memberName of Object.keys(members)) {
      const member = members[memberName];
      const newAscensionMultiplier = this.getMemberAscensionMultiplierGained(member.info);

      if (newAscensionMultiplier >= ASC_MULTS[member.rank]) {
        //ascend this member
        if (this.ns.gang.ascendMember(memberName)) {
          const newMemberInfo = this.ns.gang.getMemberInformation(memberName);
          members[memberName] = {
            info: newMemberInfo,
            rank: this.getMemberRank(newMemberInfo),
          } as GangMember;
        }
      }
    }
  }

  private purchaseGearForMembers(members: Record<string, GangMember>): void {
    const playerData = getPlayerMonitorState(this.snapshot);
    const totalMoney = playerData?.player?.money || 0;
    let budget = totalMoney * PERCENTAGE_OF_BUDGET_TO_SPEND_ON_EQUIPMENT;

    if (budget === 0) return;

    const membersWithoutAllEquipment = Object.values(members).filter(
      (m) =>
        m.info.augmentations.length < this.augmentationsNames.length ||
        m.info.upgrades.length < this.normalEquipmentNames.length,
    );

    // loop through IV, III, II, I and try purchasing stuff
    for (let i = 4; i > 0; i--) {
      for (const member of membersWithoutAllEquipment) {
        if (i !== member.rank) continue;

        // first try purchasing augs
        for (const augmentation of this.augmentationsNames) {
          if (budget <= 0) return;

          const cost = this.ns.gang.getEquipmentCost(augmentation);
          if (this.ns.gang.purchaseEquipment(member.info.name, augmentation)) {
            budget -= cost;
          }
        }

        if (budget <= 0) return;

        // then try purchasing upgrades
        for (const upgrade of this.normalEquipmentNames) {
          if (budget <= 0) return;

          const cost = this.ns.gang.getEquipmentCost(upgrade);
          if (this.ns.gang.purchaseEquipment(member.info.name, upgrade)) {
            budget -= cost;
          }
        }

        if (budget <= 0) return;
      }
    }
  }

  private getMembers(): Record<string, GangMember> {
    let members: Record<string, GangMember> = {};

    this.ns.gang.getMemberNames().forEach((name) => {
      const info = this.ns.gang.getMemberInformation(name);
      members[name] = {
        info: info,
        rank: this.getMemberRank(info),
      } as GangMember;
    });

    return members;
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
    if (ascensionMult < 6) return 1;
    if (ascensionMult < 16) return 2;
    if (ascensionMult < 32) return 3;
    return 4;
  }

  private getMemberAscensionMultiplier(member: GangMemberInfo): number {
    return Math.min(
      member.agi_asc_mult,
      member.def_asc_mult,
      member.dex_asc_mult,
      member.str_asc_mult,
    );
  }

  private getMemberAscensionMultiplierGained(member: GangMemberInfo): number {
    const multGains = this.ns.gang.getAscensionResult(member.name);

    if (!multGains) return 1;

    return Math.min(multGains.str, multGains.def, multGains.dex, multGains.agi);
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new GangBangerTask(ns).start();
}
