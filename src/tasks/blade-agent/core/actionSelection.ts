import { Action, ActionInfo, BladeburnerState } from "@repo/common/info/bladeburnerInfo";
import { allCitiesBelowChaosThreshold } from "./citySelection";
import { BladeburnerActionType } from "@ns";

const CHAOS_REPAIR = 65;
const CHAOS_HARD = 90;

const MIN_ACTION_CHANCE = 0.80;
const GOOD_ACTION_CHANCE = 0.90;
const MIN_BLACK_OP_CHANCE = 0.97;
const MAX_ACCEPTABLE_SPREAD = 0.18;

const GENERAL_TRAINING: Action = { type: "General", name: "Training" };
const GENERAL_FIELD: Action = { type: "General", name: "Field Analysis" };
const GENERAL_DIPLOMACY: Action = { type: "General", name: "Diplomacy" };
const GENERAL_REGEN: Action = { type: "General", name: "Hyperbolic Regeneration Chamber" };
const GENERAL_INCITE: Action = { type: "General", name: "Incite Violence" };

export function chooseAction(state: BladeburnerState, recoveringStamina: boolean): Action {
  const city = state.cities[state.city];

  if (recoveringStamina) {
    if (city.chaos >= CHAOS_HARD) return GENERAL_DIPLOMACY;
    return GENERAL_REGEN;
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

  if (hasUsefulUncertainAction(state)) {
    return GENERAL_FIELD;
  }

  const best = bestRankAction(state);

  if (best) {
    return best;
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
    .sort((a, b) => actionScore(b) - actionScore(a));

  return candidates[0] ?? null;
}

function actionScore(action: ActionInfo): number {
  return expectedRank(action) / Math.max(1, action.timeMs / 1_000);
}

function expectedRank(action: ActionInfo): number {
  return action.chanceMin * action.rankGain - (1 - action.chanceMin) * action.rankLoss;
}

function hasUsefulUncertainAction(state: BladeburnerState): boolean {
  return state.actions.some(a =>
    a.count > 0 &&
    a.chanceMax >= GOOD_ACTION_CHANCE &&
    a.chanceMin < MIN_ACTION_CHANCE &&
    a.chanceMax - a.chanceMin >= MAX_ACCEPTABLE_SPREAD
  );
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
