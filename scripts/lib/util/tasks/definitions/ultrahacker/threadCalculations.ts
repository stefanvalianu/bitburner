import { NS, Player, Server } from "@ns";
import { GROW_SCRIPT, HACK_SCRIPT, WEAKEN_SCRIPT } from "../../../script/constants";
import { applyGrow, applyHack, applyWeak } from "./simulationHelpers";

// ideally, do not allow a single hack to take a machine lower than
// this % of its max money. This will not always be possible (super
// high levels, etc) but this is aspirationally the ideal amount.
// the absolute MINIMUM number of hack threads has to be 1, and it
// might be possible that 1 thread goes below this percentage.
//
// 25% steal (HACK_MINIMUM_MONEY_PCT = 0.75) leaves ~13 points of head-room
// before the 0.85 drain threshold trips, giving the per-batch level-drift
// error (real hack scales with player.skills.hacking, real grow does not —
// see findOptimalBatchFrame in task.ts) enough margin to absorb without
// compounding into a runaway drain. Throughput at endgame is RAM-bound
// (we run more in-flight HWGW frames), so the per-batch steal drop nets to
// approximately unchanged $/s.
export const HACK_MINIMUM_MONEY_PCT = 0.75;

// Multiplier applied to every computed grow-thread count. Two overlapping
// reasons for safety padding here:
//   1. `formulas.hacking.growThreads` can under-predict by 1–3% due to the
//      "+1/thread linear component" quirk (GitHub bitburner #2678 — the
//      formula returns a multiplier, not a percentage, and treats the
//      additive term inconsistently with the multiplicative term).
//   2. Player skill at op-fire time is higher than at sizing time (XP from
//      prior batches' completions accumulates in-pipeline). Although the
//      pipeline-level prediction in task.ts compensates for this on the
//      hack side, residual drift from outside participation (other tasks
//      hacking the same target) or jittery XP rates can still under-grow.
// Over-growing is safe: applyGrow clamps at moneyMax. The weak2 thread
// count is recomputed against the inflated growThreads so security still
// returns exactly to min.
export const GROW_THREAD_SAFETY = 1.05;

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

  // Ceil grow-thread counts so the integer thread count we hand to ns.exec
  // never falls short of the simulated effect. The formula returns a float;
  // truncating (or treating it as float and letting ns.exec round it down)
  // systematically under-grows by a fraction of a thread per batch, which
  // compounds across a long cascade until the server drifts toward $0. The
  // GROW_THREAD_SAFETY pad adds a small uniform margin on top of that — see
  // the constant's comment for the two underlying reasons.
  const maxGrowThreadsNeeded = Math.ceil(
    ns.formulas.hacking.growThreads(
      originalTarget,
      originalPlayer,
      originalTarget.moneyMax!,
      cores,
    ) * GROW_THREAD_SAFETY,
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

  // NOTE on player mutation:
  //   Earlier revisions of this function called `applyHackingExp(ns, target,
  //   player, threads)` between each op, intending to predict the player's
  //   skill at successive op-fire times. That prediction was dead code: of
  //   the four formula calls used below, NONE depend on `player.skills.hacking`
  //   — `weakenEffect` takes only (threads, cores); `growThreads` is gated by
  //   `player.mults.hacking_grow` (a static augmentation multiplier, not the
  //   skill); `growthAnalyzeSecurity` takes no player at all.
  //   Future-player prediction happens at the pipeline level instead — the
  //   `originalPlayer` passed in here has already been projected forward to
  //   hack-fire time by `scheduleAsMuchAsPossible` so that `hackPercent` (and
  //   therefore `tryFindHackWeakGrowWeakSplit`'s maxHackThreadsForSafety
  //   calculation that gates the recursion into this function) is sized
  //   against the level the player WILL have when hack actually fires.

  // simulate the hack — reduces moneyAvailable and bumps hackDifficulty
  applyHack(ns, target, player, hackThreads);

  // simulate the weak1
  const weak1Threads = Math.ceil(
    (target.hackDifficulty! - target.minDifficulty!) / weakSecurityChangePerThread,
  );
  applyWeak(ns, target, weak1Threads, cores);

  // simulate the grow. Ceil + GROW_THREAD_SAFETY pad — see the constant's
  // comment for the rationale (float under-grow + formula quirk + residual
  // level drift).
  const growThreads = Math.ceil(
    ns.formulas.hacking.growThreads(target, player, target.moneyMax!, cores) * GROW_THREAD_SAFETY,
  );
  applyGrow(ns, target, player, growThreads, cores, true);

  // and now the last weak2. Pass undefined for host so the analyze function
  // doesn't cap based on the real server's current money — at simulation time
  // the real server is at max money, so a host-anchored call returns 0 even
  // when growThreads is large.
  const weak2Threads = Math.ceil(
    ns.growthAnalyzeSecurity(growThreads, undefined, cores) / weakSecurityChangePerThread,
  );

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
