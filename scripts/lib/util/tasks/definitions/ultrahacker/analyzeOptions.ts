import { NS, Player, Server } from "@ns";
import { ServerInfo } from "../../../dashboardTypes";
import { ServerAnalysis } from "./info";

// Returns a list of options, sorted with the most profitable one at the top
export function analyzeOptions(ns: NS, player: Player, allServers: ServerInfo[]): ServerAnalysis[] {
  // identify all the options and simulate them in optimal conditions
  const targets = allServers
    .filter(
      (s) =>
        !s.purchasedByPlayer &&
        s.hasAdminRights &&
        s.moneyAvailable &&
        s.hackDifficulty &&
        s.moneyMax &&
        s.moneyMax > 0,
    )
    .map((s) => getOptimalServer(s));

  let options = targets.map(
    (t) =>
      ({
        hostname: t.hostname,
        hackChance: ns.formulas.hacking.hackChance(t, player),
        maxMoney: t.moneyMax!,
        batchTime: approximateBatchTime(ns, t, player),
        profitPerSecond: profitCalculation(ns, t, player),
      }) satisfies ServerAnalysis,
  );

  // sort descending by profit per second
  options.sort((a, b) => b.profitPerSecond - a.profitPerSecond);

  return options;
}

function profitCalculation(ns: NS, server: Server, player: Player): number {
  const time = approximateBatchTime(ns, server, player);
  const chance = ns.formulas.hacking.hackChance(server, player);
  const money = ns.formulas.hacking.hackPercent(server, player) * server.moneyMax!;

  return chance * (money / time) * 1000;
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
