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
): GrowWeakSplit | undefined {
  // A useful split needs at least one grow and one weaken. With only 0 or 1
  // thread of room there is nothing to slice — return undefined and let the
  // caller skip the lease.
  if (totalThreads < 2) return undefined;

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

  // Search [1, totalThreads-1]: enforce ≥1 grow and ≥1 weaken on every probe.
  // Endpoints 0 and totalThreads are either degenerate (0 grow does no money
  // work) or always unsafe (0 weaken can't absorb any grow security).
  let low = 1;
  let high = totalThreads - 1;

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

  return best;
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

// Upper bound on the RAM one HWGW batch can usefully consume on a lease
// with the given cores. Returns 0 when no useful batch is possible.
// Callers use this to size their lease request rather than greedily
// grabbing whole hosts.
export function maxUsefulHwgwRam(
  ns: NS,
  target: string,
  hackRam: number,
  weakenRam: number,
  growRam: number,
  cores: number,
): number {
  const hackPctPerThread = ns.hackAnalyze(target);
  if (hackPctPerThread <= 0) return 0;

  const weakenPerThread = ns.weakenAnalyze(1, cores);
  if (weakenPerThread <= 0) return 0;

  // Match the cap inside findHackWeakenGrowWeakenSplit. The inner loop
  // skips hackThreads whose moneyStolenPct >= 0.95, so drop one thread
  // if floor() lands exactly on the boundary.
  let hackThreads = Math.floor(0.95 / hackPctPerThread);
  if (hackPctPerThread * hackThreads >= 0.95) hackThreads -= 1;
  if (hackThreads < 1) return 0;

  const moneyStolenPct = hackPctPerThread * hackThreads;
  const growMultiplier = 1 / (1 - moneyStolenPct);

  const growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target, growMultiplier, cores)));

  const hackSecurityIncrease = ns.hackAnalyzeSecurity(hackThreads, target);
  const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, target, cores);

  const hackWeakenThreads = Math.max(1, Math.ceil(hackSecurityIncrease / weakenPerThread));
  const growWeakenThreads = Math.max(1, Math.ceil(growSecurityIncrease / weakenPerThread));

  return (
    hackThreads * hackRam +
    hackWeakenThreads * weakenRam +
    growThreads * growRam +
    growWeakenThreads * weakenRam
  );
}

// Upper bound on the RAM one grow/weaken batch needs to close the
// current money deficit on `target`. Returns 0 when money is already
// at the cap (caller should stop leasing).
export function maxUsefulGrowWeakRam(
  ns: NS,
  target: string,
  growRam: number,
  weakenRam: number,
  cores: number,
): number {
  const currentMoney = Math.max(1, ns.getServerMoneyAvailable(target));
  const maxMoney = ns.getServerMaxMoney(target);
  if (currentMoney >= maxMoney) return 0;

  const weakenPerThread = ns.weakenAnalyze(1, cores);
  if (weakenPerThread <= 0) return 0;

  const growMultiplier = maxMoney / currentMoney;
  const growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(target, growMultiplier, cores)));

  const growSecurity = ns.growthAnalyzeSecurity(growThreads, target, cores);
  const weakThreads = Math.max(1, Math.ceil(growSecurity / weakenPerThread));

  return growThreads * growRam + weakThreads * weakenRam;
}

// Upper bound on the RAM needed to drive security to its minimum on
// `target`. Returns 0 when security is already at the floor.
export function maxUsefulWeakenRam(
  ns: NS,
  target: string,
  weakenRam: number,
  cores: number,
): number {
  const excess = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
  if (excess <= 0) return 0;

  const weakenPerThread = ns.weakenAnalyze(1, cores);
  if (weakenPerThread <= 0) return 0;

  const weakThreads = Math.max(1, Math.ceil(excess / weakenPerThread));
  return weakThreads * weakenRam;
}
