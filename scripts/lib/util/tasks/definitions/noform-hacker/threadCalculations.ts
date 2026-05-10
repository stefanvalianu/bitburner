import { NS } from "@ns";

interface GrowWeakSplit {
  growThreads: number;
  weakThreads: number;
  growthSecurityIncrease: number;
  weakenSecurityDecrease: number;

  // Positive means weaken covers growth by this much.
  weakenSurplus: number;
}

export function findGrowWeakSplit(
  ns: NS,
  totalThreads: number,
  target: string,
  cores: number,
): GrowWeakSplit {
  let best: GrowWeakSplit | undefined;

  const check = (growThreads: number): GrowWeakSplit => {
    const weakThreads = totalThreads - growThreads;

    const growthSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, target, cores);
    const weakenSecurityDecrease = ns.weakenAnalyze(weakThreads, cores);

    return {
      growThreads,
      weakThreads,
      growthSecurityIncrease,
      weakenSecurityDecrease,
      weakenSurplus: weakenSecurityDecrease - growthSecurityIncrease,
    };
  };

  let low = 0;
  let high = totalThreads;

  while (low <= high) {
    const growThreads = Math.floor((low + high) / 2);
    const result = check(growThreads);

    if (result.weakenSurplus >= 0) {
      // This split is safe: weaken fully covers grow security.
      // Keep it if it is closer to equal than the previous safe split.
      if (best === undefined || result.weakenSurplus < best.weakenSurplus) {
        best = result;
      }

      // Try more grow threads, which reduces weaken surplus.
      low = growThreads + 1;
    } else {
      // Not enough weaken. Use fewer grow threads and more weak threads.
      high = growThreads - 1;
    }
  }

  return best!;
}

interface HackWeakenGrowWeakenSplit {
  hackThreads: number;
  hackWeakenThreads: number;
  growThreads: number;
  growWeakenThreads: number;
  ramUsed: number;
  moneyStolenPct: number;
}

export function findHackWeakenGrowWeakenSplit(
  ns: NS,
  availableRam: number,
  target: string,
  cores: number,
  hackRam: number,
  weakenRam: number,
  growRam: number,
): HackWeakenGrowWeakenSplit | undefined {
  const hackPctPerThread = ns.hackAnalyze(target);

  if (hackPctPerThread <= 0) {
    return undefined;
  }

  const weakenPerThread = ns.weakenAnalyze(1, cores);

  if (weakenPerThread <= 0) {
    return undefined;
  }

  const maxHackThreads = Math.min(
    Math.floor(availableRam / hackRam),
    Math.floor(0.95 / hackPctPerThread),
  );

  for (let hackThreads = maxHackThreads; hackThreads >= 1; hackThreads--) {
    const moneyStolenPct = hackPctPerThread * hackThreads;

    if (moneyStolenPct <= 0 || moneyStolenPct >= 0.95) {
      continue;
    }

    const growMultiplier = 1 / (1 - moneyStolenPct);

    const growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target, growMultiplier, cores)));

    const hackSecurityIncrease = ns.hackAnalyzeSecurity(hackThreads, target);
    const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, target, cores);

    const hackWeakenThreads = Math.max(1, Math.ceil(hackSecurityIncrease / weakenPerThread));

    const growWeakenThreads = Math.max(1, Math.ceil(growSecurityIncrease / weakenPerThread));

    const ramUsed =
      hackThreads * hackRam +
      hackWeakenThreads * weakenRam +
      growThreads * growRam +
      growWeakenThreads * weakenRam;

    if (ramUsed <= availableRam) {
      return {
        hackThreads,
        hackWeakenThreads,
        growThreads,
        growWeakenThreads,
        ramUsed,
        moneyStolenPct,
      };
    }
  }

  return undefined;
}
