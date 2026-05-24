import { Action, ActionInfo, BladeburnerState } from "@repo/common/info/bladeburnerInfo";
import { allCitiesBelowChaosThreshold } from "./citySelection";
import { BladeburnerActionType } from "@ns";
import { GOOD_ACTION_CHANCE, needsEstimateWork, MAX_ACCEPTABLE_SPREAD } from "./shared";

const CHAOS_REPAIR = 65;
const CHAOS_HARD = 90;

const MIN_ACTION_CHANCE = 0.80;
const MIN_BLACK_OP_CHANCE = 0.97;

const GENERAL_TRAINING: Action = { type: "General", name: "Training" };
const GENERAL_FIELD: Action = { type: "General", name: "Field Analysis" };
const GENERAL_DIPLOMACY: Action = { type: "General", name: "Diplomacy" };
const GENERAL_REGEN: Action = { type: "General", name: "Hyperbolic Regeneration Chamber" };
const GENERAL_INCITE: Action = { type: "General", name: "Incite Violence" };

export function chooseAction(state: BladeburnerState, recoveringStamina: boolean): Action {
  const city = state.cities[state.city];

  if (recoveringStamina) {
    return city.chaos >= CHAOS_HARD ? GENERAL_DIPLOMACY : GENERAL_REGEN;
  }

  if (city.chaos >= CHAOS_HARD) {
    const retirement = findAction(state, "Operations", "Stealth Retirement Operation");

    if (retirement && retirement.count > 0 && retirement.chanceMin >= MIN_ACTION_CHANCE) {
      return retirement;
    }

    return GENERAL_DIPLOMACY;
  }

  if (
    state.nextBlackOp &&
    state.rank >= state.nextBlackOp.rankRequired &&
    state.nextBlackOp.chanceMin >= MIN_BLACK_OP_CHANCE
  ) {
    return state.nextBlackOp;
  }

  if (city.chaos >= CHAOS_REPAIR) {
    const retirement = findAction(state, "Operations", "Stealth Retirement Operation");

    if (retirement && retirement.count > 3 && retirement.chanceMin >= GOOD_ACTION_CHANCE) {
      return retirement;
    }

    return GENERAL_DIPLOMACY;
  }

  const best = bestRankAction(state);

  if (best) {
    return best;
  }

  if (isBlockedByBadEstimates(state)) {
    return GENERAL_FIELD;
  }

  if (hasAnyRemainingLimitedAction(state)) {
    return GENERAL_TRAINING;
  }

  if (allCitiesBelowChaosThreshold(state)) {
    return GENERAL_INCITE;
  }

  return GENERAL_FIELD;
}

function bestRankAction(state: BladeburnerState): ActionInfo | null {
  const candidates = state.actions
    .filter(a => a.count > 0)
    .filter(a => a.chanceMin >= MIN_ACTION_CHANCE)
    .filter(a => expectedRank(a) > 0)
    .filter(a => !reserveForSpecialUse(state, a))
    .sort((a, b) => actionScore(b, state) - actionScore(a, state));

  return candidates[0] ?? null;
}

function actionScore(action: ActionInfo, state: BladeburnerState): number {
  let score = expectedRank(action) / Math.max(1, action.timeMs / 1_000);

  // Tracking is useful for estimates, but its rank gain is low.
  // Do not let it dominate when estimates are already good.
  if (action.type === "Contracts" && action.name === "Tracking" && !needsEstimateWork(state)) {
    score *= 0.60;
  }

  // Investigation / Undercover are estimate-improving operations.
  // Keep them valuable when estimates are bad, otherwise rank/sec handles them normally.
  if ((action.name === "Investigation" || action.name === "Undercover Operation") && needsEstimateWork(state)) {
    score *= 1.25;
  }

  // Do not casually spend Stealth Retirement unless chaos repair matters.
  if (action.name === "Stealth Retirement Operation" && state.cities[state.city].chaos < CHAOS_REPAIR) {
    score *= 0.20;
  }

  return score;
}

function expectedRank(action: ActionInfo): number {
  return action.chanceMin * action.rankGain - (1 - action.chanceMin) * action.rankLoss;
}

function reserveForSpecialUse(state: BladeburnerState, action: ActionInfo): boolean {
  if (action.name === "Raid" && state.cities[state.city].communities <= 0) {
    return true;
  }

  if (action.name === "Stealth Retirement Operation" && state.cities[state.city].chaos < CHAOS_REPAIR) {
    return true;
  }

  return false;
}

function findAction(state: BladeburnerState, type: BladeburnerActionType, name: string): ActionInfo | undefined {
  return state.actions.find(a => a.type === type && a.name === name);
}

function hasAnyRemainingLimitedAction(state: BladeburnerState): boolean {
  return state.actions.some(a => a.count > 0);
}



function isBlockedByBadEstimates(state: BladeburnerState): boolean {
  const blocked = state.actions.some(a =>
    a.count > 0 &&
    a.chanceMax >= GOOD_ACTION_CHANCE &&
    a.chanceMin < MIN_ACTION_CHANCE &&
    a.chanceMax - a.chanceMin >= MAX_ACCEPTABLE_SPREAD
  );

  return blocked;
}
