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
