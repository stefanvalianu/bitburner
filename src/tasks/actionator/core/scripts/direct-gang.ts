import { NS } from "@ns";
import { GangEquipmentInfo, GangInfo, GangMember, MemberRank } from "@repo/common/info/gangInfo";
import { GANG_EQUIPMENT_PORT, GANG_INFO_PORT, getPortData, USER_PREFERENCES_PORT } from "@repo/common/ports";
import { UserPreferences } from "@repo/common/preferences";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

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
  4: 2,
};

/*
  This script is responsible for:
  - ascending gang members
  - purchasing gang member equipment
  - recruiting gang members

  NOTE this script was split out from the core gang-banger task to reduce overall
  RAM pressure. These actions are relatively independent and allow us to fold the RAM
  costs of the above into a script that shares a RAM pool with other high-cost operations.

  NOTE also this script stops running when:
  - gang is at 100% warfare and members have all purchaseable equipment
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  const userPreferences = getPortData<UserPreferences>(ns, USER_PREFERENCES_PORT);

  const equipmentInfo = getPortData<GangEquipmentInfo>(ns, GANG_EQUIPMENT_PORT);
  const gangInfo = getPortData<GangInfo>(ns, GANG_INFO_PORT);
  const hasGang = gangInfo?.hasGang ?? false;

  if (!gangInfo || !hasGang || !equipmentInfo) {
    // can't do anything until we're in a gang and have the info we need
    invokeNextScript(ns);
    return;
  }

  // 1. Always try recruiting
  tryRecruitMembers(ns);

  // 2. Try ascending eligible members
  ascendEligibleMembers(ns, gangInfo.members)

  // 3. Purchase equipment for eligible members 
  const player = ns.getPlayer();
  const budget = ((player?.money || 0) - (userPreferences?.reservedMoney || 0) * PERCENTAGE_OF_BUDGET_TO_SPEND_ON_EQUIPMENT);

  if (budget > 0) {
    purchaseGearForMembers(ns, budget, gangInfo, equipmentInfo);
  }

  invokeNextScript(ns);
}

function purchaseGearForMembers(ns: NS, budget: number, gangInfo: GangInfo, equipmentInfo: GangEquipmentInfo): void {
  const membersWithoutAllEquipment = Object.values(gangInfo.members).filter(
    (m) => {
      const memberInfo = ns.gang.getMemberInformation(m.name);
      return (memberInfo.augmentations.length < equipmentInfo.augmentations.length ||
          memberInfo.upgrades.length < equipmentInfo.normalEquipment.length);
    }
  );

  // loop through IV, III, II, I and try purchasing stuff
  for (let i = 4; i > 0; i--) {
    for (const member of membersWithoutAllEquipment) {
      if (i !== member.rank) continue;

      // first try purchasing augs
      for (const augmentation of equipmentInfo.augmentations) {
        if (budget <= 0) return;

        const cost = ns.gang.getEquipmentCost(augmentation);
        if (ns.gang.purchaseEquipment(member.name, augmentation)) {
          budget -= cost;
        }
      }

      if (budget <= 0) return;

      // then try purchasing upgrades
      for (const upgrade of equipmentInfo.normalEquipment) {
        if (budget <= 0) return;

        const cost = ns.gang.getEquipmentCost(upgrade);
        if (ns.gang.purchaseEquipment(member.name, upgrade)) {
          budget -= cost;
        }
      }

      if (budget <= 0) return;
    }
  }
}

function tryRecruitMembers(ns: NS): void {
  if (ns.gang.canRecruitMember()) {
    ns.gang.recruitMember(pickRandomGangMemberName(ns));
  }
}

function ascendEligibleMembers(ns: NS, members: GangMember[]): void {
  for (const member of members) {
    const newAscensionMultiplier = getMemberAscensionMultiplierGained(ns, member);

    if (newAscensionMultiplier >= ASC_MULTS[member.rank]) {
      //ascend this member
      ns.gang.ascendMember(member.name)
    }
  }
}

function getMemberAscensionMultiplierGained(ns: NS, member: GangMember): number {
  const multGains = ns.gang.getAscensionResult(member.name);

  if (!multGains) return 1;

  // we omit agility because it seems to always be significantly lower than the other asc multipliers, greatly slowing down asc timings
  return Math.min(multGains.str, multGains.def, multGains.dex);
}

function pickRandomGangMemberName(ns: NS): string {
  const index = Math.floor(Math.random() * GANG_MEMBER_NAMES.length);
  const count = ns.gang.getMemberNames().length;
  return `${GANG_MEMBER_NAMES[index]} ${GANG_MEMBER_SUFFIXES[count]}`;
}

const GANG_MEMBER_NAMES = [
  "Vex",
  "Nyx",
  "Rook",
  "Kade",
  "Jinx",
  "Zero",
  "Mako",
  "Ash",
  "Blitz",
  "Hex",
  "Riven",
  "Sable",
  "Knox",
  "Echo",
  "Cipher",
  "Shade",
  "Grim",
  "Reaper",
  "Ghost",
  "Fang",
  "Dagger",
  "Viper",
  "Razor",
  "Torque",
  "Crash",
  "Glitch",
  "Patch",
  "Socket",
  "Kernel",
  "Root",
  "Daemon",
  "Proxy",
  "Switch",
  "Vector",
  "Nova",
  "Onyx",
  "Slate",
  "Steel",
  "Crow",
  "Wolf",
  "Hawk",
  "Bishop",
  "Knight",
  "Pawn",
  "Ace",
  "Spade",
  "Clutch",
  "Riot",
  "Havoc",
  "Static",
  "Voltage",
  "Surge",
  "Fuse",
  "Spark",
  "Diesel",
  "Bullet",
  "Trigger",
  "Baron",
  "Duke",
  "Maven",
  "Drift",
  "Slick",
  "Lock",
  "Chain",
  "Brick",
  "Bones",
  "Grit",
  "Scythe",
  "Crowbar",
  "Mantis",
  "Wraith",
  "Specter",
  "Phantom",
  "Rogue",
  "Bandit",
  "Outlaw",
  "Maverick",
  "Nomad",
  "Stray",
  "Cinder",
  "Ember",
  "Smoke",
  "Frost",
  "Icepick",
  "Venom",
  "Cobra",
  "Jackal",
  "Hyena",
  "Ratchet",
  "Breach",
  "Crank",
  "Shiv",
  "Talon",
  "Cross",
  "Pike",
  "Flint",
  "Hollow",
  "Murk",
  "Scrap",
  "Chrome",
] as const;

const GANG_MEMBER_SUFFIXES = [
  "Tight Lips",
  "the Rat",
  "Two Knives",
  "No Face",
  "Cold Eyes",
  "the Crow",
  "Deadbolt",
  "Blackjack",
  "the Snake",
  "Quiet Jack",
  "Red Hands",
  "the Fixer",
  "Bad Luck",
  "the Ghost",
  "Iron Tooth",
  "the Shiv",
  "Low Card",
  "Mad Dog",
  "the Weasel",
  "Hard Times",
] as const;
