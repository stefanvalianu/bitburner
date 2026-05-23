import { CityName, NS } from "@ns";
import { BladeburnerState, CityInfo, SkillInfo } from "@repo/common/info/bladeburnerInfo";
import { BLADEBURNER_STATE_PORT, getPortData } from "@repo/common/ports";
import { invokeNextScript, updatePartialState } from "@repo/tasks/actionator/core/helpers";

/*
  This script is responsible for:
  - Collecting bladeburner information and publishing it to the state port

  NOTE it is broken up into multiple scripts, since these operations are expensive AF
  This script (info) runs first and produces the state mutated by next scripts.
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));
  
  const state = getPortData<BladeburnerState>(ns, BLADEBURNER_STATE_PORT) ?? {
    ts: Date.now(),
    city: "Sector-12",
    rank: 0,
    stamina: { current: 0, max: 0, pct: 0 },
    cities: emptyCities(),
    currentAction: null,
    actions: [],
    nextBlackOp: null,
    skillPoints: 0,
    skills: [],
  } satisfies BladeburnerState;

  // Assumption - this script runs first and is responsible for the base state
  if (!ns.bladeburner.inBladeburner()) {
    ns.clearPort(BLADEBURNER_STATE_PORT);
    ns.writePort(BLADEBURNER_STATE_PORT, state);

    return;
  }

  const rank = ns.bladeburner.getRank();

  const [staminaCurrent, staminaMax] = ns.bladeburner.getStamina();
  const staminaPct = staminaMax > 0 ? staminaCurrent / staminaMax : 0;

  const skills = readSkills(ns);

  updatePartialState<BladeburnerState>(ns, BLADEBURNER_STATE_PORT, {
    ts: Date.now(),
    rank,
    stamina: {
      current: staminaCurrent,
      max: staminaMax,
      pct: staminaPct,
    },
    skillPoints: ns.bladeburner.getSkillPoints(),
    skills,
  }, state);
}

function readSkills(ns: NS): SkillInfo[] {
  const bb = ns.bladeburner;

  return bb.getSkillNames().map(name => ({
    name,
    level: bb.getSkillLevel(name),
    upgradeCost: bb.getSkillUpgradeCost(name),
  }));
}

function emptyCities(): Record<CityName, CityInfo> {
  return {
    "Sector-12": { name: "Sector-12", population: 0, chaos: 0, communities: 0 },
    Aevum: { name: "Aevum", population: 0, chaos: 0, communities: 0 },
    Volhaven: { name: "Volhaven", population: 0, chaos: 0, communities: 0 },
    Chongqing: { name: "Chongqing", population: 0, chaos: 0, communities: 0 },
    "New Tokyo": { name: "New Tokyo", population: 0, chaos: 0, communities: 0 },
    Ishima: { name: "Ishima", population: 0, chaos: 0, communities: 0 },
  };
}
