import { BladeburnerState } from "@repo/common/info/bladeburnerInfo";

export const GOOD_ACTION_CHANCE = 0.88;
export const MAX_ACCEPTABLE_SPREAD = 0.20;

export function needsEstimateWork(state: BladeburnerState): boolean {
  const usefulActions = state.actions.filter(a =>
    a.count > 0 &&
    a.chanceMax >= GOOD_ACTION_CHANCE
  );

  if (usefulActions.length === 0) return false;

  return usefulActions.some(a =>
    a.chanceMax - a.chanceMin >= MAX_ACCEPTABLE_SPREAD
  );
}
