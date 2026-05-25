import { NS } from "@ns";
import { BladeburnerState } from "@repo/common/info/bladeburnerInfo";
import { GOOD_ACTION_CHANCE, needsEstimateWork } from "./shared";

export function spendOneSkillPoint(ns: NS, state: BladeburnerState): void {
  const affordable = state.skills
    .filter(skill => skill.upgradeCost <= state.skillPoints)
    .filter(skill => isProgressionSkill(skill.name))
    .filter(skill => skill.name !== "Overclock" || skill.level < 90)
    .filter(skill => shouldBuySituationalSkill(skill.name, state))
    .sort((a, b) => skillScore(a.name, a.upgradeCost, state) - skillScore(b.name, b.upgradeCost, state));

  const best = affordable[0];

  if (best) {
    ns.bladeburner.upgradeSkill(best.name);
  }
}

function isProgressionSkill(name: string): boolean {
  return (
    name === "Overclock" ||
    name === "Blade's Intuition" ||
    name === "Digital Observer" ||
    name === "Cloak" ||
    name === "Short-Circuit" ||
    name === "Evasive System" ||
    name === "Reaper" ||
    name === "Tracer" ||
    name === "Cyber's Edge" ||
    name === "Datamancer"
  );
}

function shouldBuySituationalSkill(name: string, state: BladeburnerState): boolean {
  if (name === "Datamancer") {
    return needsEstimateWork(state);
  }

  if (name === "Cyber's Edge") {
    return state.stamina.pct < 0.65 || state.stamina.max < 400;
  }

  if (name === "Tracer") {
    return state.actions.some(a =>
      a.type === "Contracts" &&
      a.count > 0 &&
      a.chanceMin < GOOD_ACTION_CHANCE
    );
  }

  return true;
}

function skillScore(name: string, cost: number, s: BladeburnerState): number {
  let weight = 1.0;

  switch (name) {
    case "Overclock":
      weight = 0.45;
      break;

    case "Blade's Intuition":
      weight = 0.60;
      break;

    case "Digital Observer":
      weight = 0.70;
      break;

    case "Evasive System":
      weight = 0.75;
      break;

    case "Cloak":
      weight = 0.85;
      break;

    case "Short-Circuit":
      weight = 0.90;
      break;

    case "Reaper":
      weight = 1.00;
      break;

    case "Tracer":
      weight = 1.10;
      break;

    case "Cyber's Edge":
      weight = s.stamina.pct < 0.60 ? 0.95 : 1.40;
      break;

    case "Datamancer":
      weight = 1.25;
      break;
  }

  return cost * weight;
}
