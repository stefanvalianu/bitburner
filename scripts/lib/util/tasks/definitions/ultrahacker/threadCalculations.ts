import { NS, Player, Server } from "@ns";
import { GROW_SCRIPT, HACK_SCRIPT, WEAKEN_SCRIPT } from "../../../script/constants";

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
  if (growRam + weakRam < maxRam) return undefined;

  const maxGrowThreadsNeeded = ns.formulas.hacking.growThreads(originalTarget, originalPlayer, originalTarget.moneyMax!, cores);
  const weakSecurityChangePerThread = ns.formulas.hacking.weakenEffect(1, cores);

  // let's start on the assumption that we will have 1 weak thread, and UP TO as many grow threads as we can fit in the ram allotment
  let proposedGrowThreads = Math.min(maxGrowThreadsNeeded, (maxRam - weakRam) / growRam);
  let proposedGrowSecurityIncrease = ns.growthAnalyzeSecurity(proposedGrowThreads, originalTarget.hostname, cores);
  let proposedWeakThreads = Math.ceil(proposedGrowSecurityIncrease / weakSecurityChangePerThread);

  // TODO - switch this to binary search for finding optimal slot
  while (proposedGrowThreads > 1) {
    if (((proposedGrowThreads * growRam) + (proposedWeakThreads * weakRam)) <= maxRam) {
      // great, we found a batch that works to grow the server to SOME amount while maintaining min security
      return {
        growThreads: proposedGrowThreads,
        weakThreads: proposedWeakThreads
      }
    }

    // we'll keep going, decreasing the number of grow threads by 1 as we try to find the maximum amount we can use while undoing security increase
    proposedGrowThreads--;
    proposedGrowSecurityIncrease = ns.growthAnalyzeSecurity(proposedGrowThreads, originalTarget.hostname, cores);
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
  // - if 1 hack thread would drain the server completely, return undefined.
  // - aim to prevent the hack operation from draining more than HACK_MINIMUM_MONEY_PCT of a server
  // - when in doubt, use more weak threads
  // - split needs to guarantee that after the operations, server will remain at min security and max money

  const weakSecurityChangePerThread = ns.formulas.hacking.weakenEffect(1, cores);

  // HYPOTHESIS: the optimal amount to threads to use for hacking a server is either:
  // - 1 thread, if it would take multiple grow threads to recover the money
  // - however many threads it takes to bring the server to a money level that can be recovered in 1 grow
  const x = ns.formulas.hacking.hackPercent()

  // guess we failed
  return undefined;
}

function hackOrGrowDominant(ns: NS, originalTarget: Server, originalPlayer: Player, cores: number): "hack" | "grow" {
  return "hack";
}
