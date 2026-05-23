import { NS } from "@ns";
import { BladeburnerState } from "@repo/common/info/bladeburnerInfo";

const WEIGHTS: Record<string, number> = {
    "Overclock": 0.55,
    "Blade's Intuition": 0.70,
    "Digital Observer": 0.80,
    "Cloak": 0.90,
    "Short-Circuit": 0.90,
    "Evasive System": 1.00,
    "Tracer": 1.05,
    "Reaper": 1.10,
    "Cyber's Edge": 1.35,
    "Datamancer": 1.50,
    "Hands of Midas": 2.25,
    "Hyperdrive": 2.50,
  };

export function spendOneSkillPoint(ns: NS, s: BladeburnerState): void {
  const affordable = s.skills
    .filter(skill => skill.upgradeCost <= s.skillPoints)
    .filter(skill => skill.name !== "Overclock" || skill.level < 90)
    .sort((a, b) => skillPriority(a.name, a.upgradeCost) - skillPriority(b.name, b.upgradeCost));

  const best = affordable[0];

  if (best) {
    ns.bladeburner.upgradeSkill(best.name);
  }
}

function skillPriority(name: string, cost: number): number {
  return cost * (WEIGHTS[name] ?? 1.25);
}
