import { NS, Player, Server } from "@ns";
import { GROW_SCRIPT, HACK_SCRIPT, WEAKEN_SCRIPT } from "../../../script/constants";
import { applyGrow, applyHack, applyHackingExp, applyWeak } from "./simulationHelpers";

// ideally, do not allow a single hack to take a machine lower than
// this % of its max money. This will not always be possible (super
// high levels, etc) but this is aspirationally the ideal amount.
// the absolute MINIMUM number of hack threads has to be 1, and it
// might be possible that 1 thread goes below this percentage.
export const HACK_MINIMUM_MONEY_PCT = 0.66;

export interface GrowWeakSplit {
  growThreads: number;
  weakThreads: number;
}

export interface HackWeakGrowWeakSplit {
  hackThreads: number;
  weak1Threads: number;
  growThreads: number;
  weak2Threads: number;
}

// Attempts to find a Grow/Weak split of threads given the constraints.
// Does NOT modify the original player/server objects.
// Returns undefined on failure
export function tryFindGrowWeakSplit(
  ns: NS,
  maxRam: number,
  cores: number,
  originalPlayer: Player,
  originalTarget: Server,
): GrowWeakSplit | undefined {
  const growRam = ns.getScriptRam(GROW_SCRIPT);
  const weakRam = ns.getScriptRam(WEAKEN_SCRIPT);
  // rules:
  // - need at least 1 grow thread and 1 weak thread.
  // - when in doubt, use more weak threads
  // - split needs to guarantee that after the operations, server will remain at min security
  if (growRam + weakRam > maxRam) return undefined;

  const maxGrowThreadsNeeded = ns.formulas.hacking.growThreads(
    originalTarget,
    originalPlayer,
    originalTarget.moneyMax!,
    cores,
  );
  const weakSecurityChangePerThread = ns.formulas.hacking.weakenEffect(1, cores);

  // let's start on the assumption that we will have 1 weak thread, and UP TO as many grow threads as we can fit in the ram allotment
  let proposedGrowThreads = Math.min(
    maxGrowThreadsNeeded,
    Math.floor((maxRam - weakRam) / growRam),
  );
  // Pass undefined for host so growthAnalyzeSecurity returns the uncapped per-
  // thread security increase. With a host, the formula caps at "threads needed
  // to reach max money" — which underestimates the security bump our weak
  // threads have to undo, leaving the server drifting up in security.
  let proposedGrowSecurityIncrease = ns.growthAnalyzeSecurity(
    proposedGrowThreads,
    undefined,
    cores,
  );
  let proposedWeakThreads = Math.ceil(proposedGrowSecurityIncrease / weakSecurityChangePerThread);

  // TODO - switch this to binary search for finding optimal slot
  while (proposedGrowThreads >= 1) {
    if (proposedGrowThreads * growRam + proposedWeakThreads * weakRam <= maxRam) {
      // great, we found a batch that works to grow the server to SOME amount while maintaining min security
      return {
        growThreads: proposedGrowThreads,
        weakThreads: proposedWeakThreads,
      };
    }

    // we'll keep going, decreasing the number of grow threads by 1 as we try to find the maximum amount we can use while undoing security increase
    proposedGrowThreads--;
    proposedGrowSecurityIncrease = ns.growthAnalyzeSecurity(proposedGrowThreads, undefined, cores);
    proposedWeakThreads = Math.ceil(proposedGrowSecurityIncrease / weakSecurityChangePerThread);
  }

  // guess we failed
  return undefined;
}

// Attempts to find a HWGW split of threads given the constraints. Does
// NOT modify the original player/server objects.
// Returns undefined on failure.
export function tryFindHackWeakGrowWeakSplit(
  ns: NS,
  maxRam: number,
  cores: number,
  originalPlayer: Player,
  originalTarget: Server,
): HackWeakGrowWeakSplit | undefined {
  const growRam = ns.getScriptRam(GROW_SCRIPT);
  const weakRam = ns.getScriptRam(WEAKEN_SCRIPT);
  const hackRam = ns.getScriptRam(HACK_SCRIPT);
  // rules:
  // - need at least 1 of each thread.
  // - aim to prevent the hack operation from draining more than HACK_MINIMUM_MONEY_PCT of a server
  // - when in doubt, use more weak threads
  // - split needs to guarantee that after the operations, server will remain at min security and max money

  const hackPercentagePerThread = ns.formulas.hacking.hackPercent(originalTarget, originalPlayer);

  // Cap initial hackThreads so a single batch never drains the server below
  // HACK_MINIMUM_MONEY_PCT of max. Hack effectiveness scales with player skill
  // at op-finish time, but grow effectiveness depends only on static
  // augmentation mults — so a batch sized close to 100% drain is fragile: any
  // upward XP drift makes real hack over-steal while real grow recovers no
  // extra, and the error compounds across batches until money pins at 0.
  // Keeping a buffer (default ~34% drain) bounds per-batch error to a level
  // the GW recovery frame can absorb.
  const maxHackThreadsForSafety = Math.max(
    1,
    Math.floor((1 - HACK_MINIMUM_MONEY_PCT) / hackPercentagePerThread),
  );

  // Always seed at the safety cap: it is the throughput target. The RAM-fit
  // loop below trims downward when a host can't fit the batch; there is no
  // upside to seeding smaller, since the seed is also the ceiling (the loop
  // only decrements).
  let proposal = simulateHWGW(ns, maxHackThreadsForSafety, cores, originalTarget, originalPlayer);

  // TODO - switch this to binary search for finding optimal slot
  while (proposal.hackThreads >= 1) {
    // A valid HWGW batch needs every phase to actually run — a 0-thread phase
    // means we'd ns.exec something with threads=0 (impossible) or, worse,
    // place a frame whose ram accounting doesn't match what it'll really do.
    // simulateHWGW should never emit a zero now that applyHack/analyze calls
    // are simulation-aware, but if it ever does (e.g. hackPct rounded to 0 at
    // very low player skill), fail loudly rather than schedule garbage.
    const valid =
      proposal.hackThreads >= 1 &&
      proposal.weak1Threads >= 1 &&
      proposal.growThreads >= 1 &&
      proposal.weak2Threads >= 1;
    if (!valid) return undefined;

    if (
      proposal.hackThreads * hackRam +
        proposal.growThreads * growRam +
        (proposal.weak1Threads + proposal.weak2Threads) * weakRam <=
      maxRam
    ) {
      // great, we found a batch that works to grow the server to SOME amount while maintaining min security
      return proposal;
    }

    // we'll keep going, decreasing the number of hack threads by 1 as we try to find the maximum amount we can use while undoing security increase
    proposal = simulateHWGW(ns, proposal.hackThreads - 1, cores, originalTarget, originalPlayer);
  }

  // guess we failed
  return undefined;
}

// This function simply simulates the required operations needed given a # of hacks to
// bring the server back to pristine conditions. Purely driven by the hack thread count
function simulateHWGW(
  ns: NS,
  hackThreads: number,
  cores: number,
  originalTarget: Server,
  originalPlayer: Player,
): HackWeakGrowWeakSplit {
  const target = cloneServer(originalTarget);
  const player = clonePlayer(originalPlayer);

  const weakSecurityChangePerThread = ns.formulas.hacking.weakenEffect(1, cores);

  // simulate the hack — reduces moneyAvailable and bumps hackDifficulty
  applyHack(ns, target, player, hackThreads);
  applyHackingExp(ns, target, player, hackThreads);

  // simulate the weak1
  const weak1Threads = Math.ceil(
    (target.hackDifficulty! - target.minDifficulty!) / weakSecurityChangePerThread,
  );
  applyWeak(ns, target, weak1Threads, cores);
  applyHackingExp(ns, target, player, weak1Threads);

  // simulate the grow
  const growThreads = ns.formulas.hacking.growThreads(target, player, target.moneyMax!, cores);
  applyGrow(ns, target, player, growThreads, cores, true);
  applyHackingExp(ns, target, player, growThreads);

  // and now the last weak2. Pass undefined for host so the analyze function
  // doesn't cap based on the real server's current money — at simulation time
  // the real server is at max money, so a host-anchored call returns 0 even
  // when growThreads is large.
  const weak2Threads = Math.ceil(
    ns.growthAnalyzeSecurity(growThreads, undefined, cores) / weakSecurityChangePerThread,
  );
  applyHackingExp(ns, target, player, weak2Threads);

  // state doesn't matter anymore, this is what we need (target/player is a cloned object)
  return {
    hackThreads: hackThreads,
    weak1Threads: weak1Threads,
    growThreads: growThreads,
    weak2Threads: weak2Threads,
  };
}

// Spread-copy so applyHackingExp's mutations don't leak back to the caller.
// `skills` and `exp` are mutated, so they need their own shallow copies too.
export function clonePlayer(originalPlayer: Player): Player {
  return {
    ...originalPlayer,
    skills: { ...originalPlayer.skills },
    exp: { ...originalPlayer.exp },
  };
}

export function cloneServer(originalServer: Server): Server {
  return { ...originalServer };
}
