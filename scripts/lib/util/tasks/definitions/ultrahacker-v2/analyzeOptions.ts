import { NS, Player, Server } from "@ns";
import { ServerInfo } from "../../../dashboardTypes";
import { ServerAnalysis } from "./info";

// Predicate for "can this server be the subject of a HWGW pipeline?".
// Mirrors the filter analyzeOptions used inline previously; exported so the
// task code can apply the same gate when opening a pipeline directly (e.g. a
// user-pinned target, or a fresh ns.getServer read during heal-rebase). Any
// path that hands a server to thread-calc helpers must run this first —
// otherwise simulateHWGW / tryFindGrowWeakSplit can propagate NaN into
// formulas.hacking.growThreads, which throws.
export function isHackableServer(s: Server): boolean {
  return (
    !s.purchasedByPlayer &&
    !!s.hasAdminRights &&
    !!s.moneyAvailable &&
    !!s.hackDifficulty &&
    !!s.minDifficulty &&
    !!s.moneyMax &&
    s.moneyMax > 0
  );
}

// Returns a list of options, sorted with the most profitable one at the top
export function analyzeOptions(ns: NS, player: Player, allServers: ServerInfo[]): ServerAnalysis[] {
  // identify all the options and simulate them in optimal conditions
  const targets = allServers.filter(isHackableServer).map((s) => getOptimalServer(s));

  let options = targets.map(
    (t) =>
      ({
        hostname: t.hostname,
        hackChance: ns.formulas.hacking.hackChance(t, player),
        maxMoney: t.moneyMax!,
        batchTime: approximateBatchTime(ns, t, player),
        profitPerSecond: profitCalculation(ns, t, player),
        xpPerSecond: xpCalculation(ns, t, player),
      }) satisfies ServerAnalysis,
  );

  // sort descending by profit per second
  options.sort((a, b) => b.profitPerSecond - a.profitPerSecond);

  return options;
}

// Mirrors HACK_MINIMUM_MONEY_PCT in task.ts. Duplicated here to avoid an
// analyzeOptions → task → analyzeOptions import cycle.
const HACK_MINIMUM_MONEY_PCT = 0.66;

function profitCalculation(ns: NS, server: Server, player: Player): number {
  const time = approximateBatchTime(ns, server, player);
  const chance = ns.formulas.hacking.hackChance(server, player);
  // tryFindHackWeakGrowWeakSplit sizes hack threads so each batch steals
  // approximately (1 - HACK_MINIMUM_MONEY_PCT) of moneyMax regardless of the
  // per-thread hackPercent. Using hackPercent here would under-rate targets
  // where per-thread hackPercent is low — we just use more hack threads to
  // hit the same fraction of moneyMax.
  const moneyPerBatch = (1 - HACK_MINIMUM_MONEY_PCT) * server.moneyMax!;

  return chance * (moneyPerBatch / time) * 1000;
}

// XP per second (per-thread) for one continuous HWGW batch. Each of the four
// ops (hack, weak, grow, weak) gives hackExp XP per thread, and they overlap
// inside a single batchTime window.
function xpCalculation(ns: NS, server: Server, player: Player): number {
  const time = approximateBatchTime(ns, server, player);
  const expPerOp = ns.formulas.hacking.hackExp(server, player);
  return ((4 * expPerOp) / time) * 1000;
}

function approximateBatchTime(ns: NS, server: Server, player: Player): number {
  return Math.max(
    ns.formulas.hacking.growTime(server, player),
    ns.formulas.hacking.hackTime(server, player),
    ns.formulas.hacking.weakenTime(server, player),
  );
}

function getOptimalServer(server: Server): Server {
  return {
    ...server,
    moneyAvailable: server.moneyMax,
    hackDifficulty: server.minDifficulty,
  };
}
