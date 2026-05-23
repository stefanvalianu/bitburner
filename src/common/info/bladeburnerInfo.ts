import { BladeburnerActionName, BladeburnerActionType, BladeburnerSkillName, CityName } from "@ns";

export interface Action {
  type: BladeburnerActionType;
  name: BladeburnerActionName;
}

export interface CurrentAction extends Action {
  currentTimeMs: number;
  totalTimeMs: number;
}

export interface CityInfo {
  name: CityName;
  population: number;
  chaos: number;
  communities: number;
}

export interface ActionInfo extends Action {
  count: number;
  level: number;
  chanceMin: number;
  chanceMax: number;
  timeMs: number;
  rankGain: number;
  rankLoss: number;
}

export interface SkillInfo {
  name: BladeburnerSkillName;
  level: number;
  upgradeCost: number;
}

export interface BlackOpsInfo extends Action {
  rankRequired: number;
  chanceMin: number;
  chanceMax: number;
  timeMs: number;
}

export interface BladeburnerState {
  ts: number;

  city: CityName;
  rank: number;

  stamina: {
    current: number;
    max: number;
    pct: number;
  };

  cities: Record<CityName, CityInfo>;
  currentAction: CurrentAction | null;

  actions: ActionInfo[];
  nextBlackOp: BlackOpsInfo | null;

  skillPoints: number;
  skills: SkillInfo[];
}

export const CITIES: CityName[] = [
  "Aevum",
  "Chongqing",
  "Ishima",
  "New Tokyo",
  "Sector-12",
  "Volhaven"
];

export function sameAction(a: Action | null | undefined, b: Action | null | undefined): boolean {
  return !!a && !!b && a.type === b.type && a.name === b.name;
}
