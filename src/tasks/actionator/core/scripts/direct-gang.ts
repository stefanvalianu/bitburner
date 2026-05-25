import { GangMemberAscension, GangMemberInfo, NS } from "@ns";
import { GangEquipmentInfo, GangInfo } from "@repo/common/info/gangInfo";
import { GANG_EQUIPMENT_PORT, GANG_INFO_PORT, getPortData, USER_PREFERENCES_PORT } from "@repo/common/ports";
import { UserPreferences } from "@repo/common/preferences";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

// Each "cycle" allow us to use 15% of our budget to
// purchase equipment for members
const PERCENTAGE_OF_BUDGET_TO_SPEND_ON_EQUIPMENT = 0.15;

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
  ns.atExit(() => invokeNextScript(ns));

  const userPreferences = getPortData<UserPreferences>(ns, USER_PREFERENCES_PORT);

  const equipmentInfo = getPortData<GangEquipmentInfo>(ns, GANG_EQUIPMENT_PORT);
  const gangInfo = getPortData<GangInfo>(ns, GANG_INFO_PORT);
  const hasGang = gangInfo?.hasGang ?? false;

  if (!gangInfo || !hasGang || !equipmentInfo) {
    // can't do anything until we're in a gang and have the info we need
    return;
  }

  // 1. Always try recruiting
  tryRecruitMembers(ns);

  // 2. Try ascending eligible members
  ascendEligibleMembers(ns, gangInfo)

  // 3. Purchase equipment for eligible members 
  const budget = (ns.getServerMoneyAvailable("home") - (userPreferences?.reservedMoney || 0)) * PERCENTAGE_OF_BUDGET_TO_SPEND_ON_EQUIPMENT;

  if (budget > 0) {
    purchaseGearForMembers(ns, budget, gangInfo, equipmentInfo);
  }
}

function purchaseGearForMembers(ns: NS, budget: number, gangInfo: GangInfo, equipmentInfo: GangEquipmentInfo): void {
  const membersWithoutAllEquipment = Object.values(gangInfo.members).filter(
    (m) => {
      const memberInfo = ns.gang.getMemberInformation(m.name);
      return (memberInfo.augmentations.length < equipmentInfo.augmentations.length ||
          memberInfo.upgrades.length < equipmentInfo.normalEquipment.length);
    }
  );

  for (const member of membersWithoutAllEquipment) {
    // first try purchasing augs
    for (const augmentation of equipmentInfo.augmentations) {
      if (budget <= 0) return;

      const cost = ns.gang.getEquipmentCost(augmentation);
      if (cost <= budget && ns.gang.purchaseEquipment(member.name, augmentation)) {
        budget -= cost;
      }
    }

    if (budget <= 0) return;

    // then try purchasing upgrades
    for (const upgrade of equipmentInfo.normalEquipment) {
      if (budget <= 0) return;

      const cost = ns.gang.getEquipmentCost(upgrade);
      if (cost <= budget && ns.gang.purchaseEquipment(member.name, upgrade)) {
        budget -= cost;
      }
    }

    if (budget <= 0) return;
  }
}

function tryRecruitMembers(ns: NS): void {
  if (ns.gang.canRecruitMember()) {
    ns.gang.recruitMember(pickRandomGangMemberName(ns));
  }
}

/*
  Ascensions are based on the game state. Pre-territory completion, we
  optimize for the Terrorism task. Post-terrotiry, we optimize for
  Human Trafficking.
*/
function ascendEligibleMembers(ns: NS, gangInfo: GangInfo): void {
  for (const member of gangInfo.members) {
    const ascResult = ns.gang.getAscensionResult(member.name);

    if (!ascResult) continue;
    const optimizeHumanTrafficking = gangInfo.territory === 1;
    const memberInfo = ns.gang.getMemberInformation(member.name);

    const ascensionScore = optimizeHumanTrafficking ? getHumanTraffickingAscScore(ascResult) : getTerrorismAscScore(ascResult);
    const currentScore = optimizeHumanTrafficking ? getHumanTraffickingScore(memberInfo) : getTerrorismScore(memberInfo);
    
    const threshold = getAscThreshold(currentScore);

    if (ascensionScore >= threshold) {
      ns.gang.ascendMember(member.name);
    }
  }
}

function getAscThreshold(currentScore: number): number {
  if (currentScore < 10) return 1.3;
  if (currentScore < 100) return 1.4;
  if (currentScore < 1_000) return 1.5;
  if (currentScore < 10_000) return 1.6;
  return 1.7;
}

function getHumanTraffickingAscScore(ascensionResult: GangMemberAscension): number {
  return (0.3 * ascensionResult.hack + 0.05 * ascensionResult.str + 0.05 * ascensionResult.def + 0.3 * ascensionResult.dex + 0.3 * ascensionResult.cha);
}

function getHumanTraffickingScore(member: GangMemberInfo): number {
  return (0.3 * member.hack_asc_mult + 0.05 * member.str_asc_mult + 0.05 * member.def_asc_mult + 0.3 * member.dex_asc_mult + 0.3 * member.cha_asc_mult);
}

function getTerrorismAscScore(ascensionResult: GangMemberAscension): number {
  return (ascensionResult.hack + ascensionResult.str + ascensionResult.def + ascensionResult.dex + ascensionResult.cha) / 5;
}

function getTerrorismScore(member: GangMemberInfo): number {
  return (member.hack_asc_mult + member.str_asc_mult + member.def_asc_mult + member.dex_asc_mult + member.cha_asc_mult) / 5;
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
