import { NS, SleeveCrimeTask, SleeveTask } from "@ns";
import { GangInfo } from "@repo/common/info/gangInfo";
import { SleeveInfo } from "@repo/common/info/sleeveInfo";
import {
  GANG_INFO_PORT,
  getPortData,
  SLEEVE_INFO_PORT,
  USER_PREFERENCES_PORT,
} from "@repo/common/ports";
import { UserPreferences } from "@repo/common/preferences";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

const PRE_GANG_SHOCK_TARGET = 50;
const POST_GANG_SHOCK_TARGET = 0;

const SLEEVE_BASELINE_STAT = 75;

const PLAYER_HACK_BASELINE = 30;
const PLAYER_CHA_BASELINE = 30;
const PLAYER_STR_BASELINE = 75;
const PLAYER_DEF_BASELINE = 75;
const PLAYER_DEX_BASELINE = 75;
const PLAYER_AGI_BASELINE = 75;

const SLEEVE_CONTRACT_MIN_CHANCE = 0.85;
const SLEEVE_TRACKING_MIN_CHANCE = 0.75;

const BLACK_OP_READY_CHANCE = 0.97;
const BLACK_OP_SUPPORT_CHANCE = 0.86;
const MAX_SUPPORT_SLEEVES = 4;

/*
  This script is responsible for:
  - Assigning optimal tasks for sleeves

  NOTE the logic is roughly:
  - Go to 50 shock
  - If not in gang, train stats to 75 then homicide
  - Get to 0 shock
  - Bring the player to some minimum stat threshold by training
  - Do bladeburner tasks if in bladeburner
  - Bond forgery otherwise (farm INT)

*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));

  const sleeveInfo = getPortData<SleeveInfo>(ns, SLEEVE_INFO_PORT);
  const userPreferences = getPortData<UserPreferences>(ns, USER_PREFERENCES_PORT);

  if (!sleeveInfo || (userPreferences?.pauseSleeveActions ?? false)) {
    return;
  }

  const gangInfo = getPortData<GangInfo>(ns, GANG_INFO_PORT);
  const hasGang = gangInfo?.hasGang ?? false;

  const player = ns.getPlayer();

  const hackTarget = PLAYER_HACK_BASELINE * (player.mults.hacking + player.mults.hacking_exp);
  const chaTarget = PLAYER_CHA_BASELINE * (player.mults.charisma + player.mults.charisma_exp);
  const strTarget = PLAYER_STR_BASELINE * (player.mults.strength + player.mults.strength_exp);
  const defTarget = PLAYER_DEF_BASELINE * (player.mults.defense + player.mults.defense_exp);
  const dexTarget = PLAYER_DEX_BASELINE * (player.mults.dexterity + player.mults.dexterity_exp);
  const agiTarget = PLAYER_AGI_BASELINE * (player.mults.agility + player.mults.agility_exp);

  const inBladeburner = ns.bladeburner.inBladeburner();
  const needEstimates = inBladeburner && needsEstimateWork(ns);
  const shouldSupport = inBladeburner && shouldSupportMainBladeburner(ns);

  let usedRetirement = false;
  let usedBountyHunter = false;
  let usedTracking = false;
  let supportSleeves = 0;

  for (const sleeve of sleeveInfo.sleeves) {
    const task = ns.sleeve.getTask(sleeve.index);

    if (sleeve.shock > (hasGang ? POST_GANG_SHOCK_TARGET : PRE_GANG_SHOCK_TARGET)) {
      if (task?.type !== "RECOVERY") {
        ns.sleeve.setToShockRecovery(sleeve.index);
      }
      continue;
    }

    if (sleeve.str < SLEEVE_BASELINE_STAT) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "str");
      continue;
    }

    if (sleeve.def < SLEEVE_BASELINE_STAT) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "def");
      continue;
    }

    if (sleeve.dex < SLEEVE_BASELINE_STAT) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "dex");
      continue;
    }

    if (sleeve.agi < SLEEVE_BASELINE_STAT) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "agi");
      continue;
    }

    if (!hasGang) {
      if (!isCrimeTask(task, "Homicide")) {
        ns.sleeve.setToCommitCrime(sleeve.index, "Homicide");
      }
      continue;
    }

    if (player.skills.hacking < hackTarget) {
      ns.sleeve.setToUniversityCourse(sleeve.index, "Rothman University", "Algorithms");
      continue;
    }

    if (player.skills.charisma < chaTarget) {
      ns.sleeve.setToUniversityCourse(sleeve.index, "Rothman University", "Leadership");
      continue;
    }

    if (player.skills.strength < strTarget) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "str");
      continue;
    }

    if (player.skills.defense < defTarget) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "def");
      continue;
    }

    if (player.skills.dexterity < dexTarget) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "dex");
      continue;
    }

    if (player.skills.agility < agiTarget) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "agi");
      continue;
    }

    if (inBladeburner) {
      if (
        !usedRetirement &&
        canSleeveDoContract(ns, sleeve.index, "Retirement", SLEEVE_CONTRACT_MIN_CHANCE)
      ) {
        usedRetirement = true;
        setSleeveContract(ns, sleeve.index, task, "Retirement");
        continue;
      }

      if (
        !usedBountyHunter &&
        canSleeveDoContract(ns, sleeve.index, "Bounty Hunter", SLEEVE_CONTRACT_MIN_CHANCE)
      ) {
        usedBountyHunter = true;
        setSleeveContract(ns, sleeve.index, task, "Bounty Hunter");
        continue;
      }

      if (
        needEstimates &&
        !usedTracking &&
        canSleeveDoContract(ns, sleeve.index, "Tracking", SLEEVE_TRACKING_MIN_CHANCE)
      ) {
        usedTracking = true;
        setSleeveContract(ns, sleeve.index, task, "Tracking");
        continue;
      }

      if (shouldSupport && supportSleeves < MAX_SUPPORT_SLEEVES) {
        supportSleeves++;

        if (task?.type !== "SUPPORT") {
          ns.sleeve.setToBladeburnerAction(sleeve.index, "Support main sleeve");
        }

        continue;
      }

      if (task?.type !== "INFILTRATE") {
        ns.sleeve.setToBladeburnerAction(sleeve.index, "Infiltrate Synthoids");
      }

      continue;
    }

    if (!isCrimeTask(task, "Bond Forgery")) {
      ns.sleeve.setToCommitCrime(sleeve.index, "Bond Forgery");
    }
  }
}

function canSleeveDoContract(
  ns: NS,
  sleeveIndex: number,
  contract: "Retirement" | "Bounty Hunter" | "Tracking",
  minChance: number,
): boolean {
  if (Math.floor(ns.bladeburner.getActionCountRemaining("Contracts", contract)) < 1) {
    return false;
  }

  const [chance] = ns.bladeburner.getActionEstimatedSuccessChance(
    "Contracts",
    contract,
    sleeveIndex,
  );

  return chance >= minChance;
}

function setSleeveContract(
  ns: NS,
  sleeveIndex: number,
  task: SleeveTask | null,
  contract: "Retirement" | "Bounty Hunter" | "Tracking",
): void {
  if (
    task?.type === "BLADEBURNER" &&
    task.actionType === "Contracts" &&
    task.actionName === contract
  ) {
    return;
  }

  ns.sleeve.setToBladeburnerAction(sleeveIndex, "Take on contracts", contract);
}

function needsEstimateWork(ns: NS): boolean {
  const contracts = ns.bladeburner.getContractNames();

  for (const name of contracts) {
    if (Math.floor(ns.bladeburner.getActionCountRemaining("Contracts", name)) < 1) {
      continue;
    }

    const [minChance, maxChance] =
      ns.bladeburner.getActionEstimatedSuccessChance("Contracts", name);

    if (maxChance >= 0.88 && minChance < 0.75 && maxChance - minChance >= 0.20) {
      return true;
    }
  }

  const operations = ns.bladeburner.getOperationNames();

  for (const name of operations) {
    if (Math.floor(ns.bladeburner.getActionCountRemaining("Operations", name)) < 1) {
      continue;
    }

    const [minChance, maxChance] =
      ns.bladeburner.getActionEstimatedSuccessChance("Operations", name);

    if (maxChance >= 0.88 && minChance < 0.75 && maxChance - minChance >= 0.20) {
      return true;
    }
  }

  return false;
}

function shouldSupportMainBladeburner(ns: NS): boolean {
  const nextBlackOp = ns.bladeburner.getNextBlackOp();

  if (!nextBlackOp) {
    return false;
  }

  if (ns.bladeburner.getRank() < ns.bladeburner.getBlackOpRank(nextBlackOp.name)) {
    return false;
  }

  const [chance] = ns.bladeburner.getActionEstimatedSuccessChance(
    "Black Operations",
    nextBlackOp.name,
  );

  return chance >= BLACK_OP_SUPPORT_CHANCE && chance < BLACK_OP_READY_CHANCE;
}

function isCrimeTask(
  task: SleeveTask | null,
  crimeType: SleeveCrimeTask["crimeType"],
): boolean {
  return task?.type === "CRIME" && task.crimeType === crimeType;
}
