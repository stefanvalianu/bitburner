import { NS } from "@ns";
import { ServerInfo } from "../../../dashboardTypes";
import { ServerAnalysis, ServerAnalysisReport } from "./info";

function analyzeTarget(ns: NS, server: ServerInfo): ServerAnalysis | undefined {
  // Only filter out structurally incompatible servers.
  if (
    !server.hasAdminRights ||
    server.purchasedByPlayer ||
    server.moneyAvailable == null ||
    server.moneyMax == null ||
    server.moneyMax <= 0
  ) {
    return undefined;
  }

  const hostname = server.hostname;

  const moneyAvailable = Math.max(0, server.moneyAvailable);
  const moneyMax = server.moneyMax;

  const hackChance = ns.hackAnalyzeChance(hostname);
  const hackPctPerThread = ns.hackAnalyze(hostname);

  const hackTime = ns.getHackTime(hostname);
  const weakTime = ns.getWeakenTime(hostname);
  const growTime = ns.getGrowTime(hostname);

  // For HWGW batches, scripts overlap. Wall time is basically the longest script.
  const batchWallTime = Math.max(hackTime, weakTime, growTime);

  let profitScore = 0;

  if (hackChance > 0 && hackPctPerThread > 0 && batchWallTime > 0) {
    const moneyPct = moneyAvailable / moneyMax;

    // Current money matters most.
    const currentMoneyValue = moneyAvailable;

    // Max money matters too, but only partially.
    // If the server is drained, this potential is penalized because it takes time
    // to grow back up before it becomes useful.
    const maxMoneyPotentialWeight = 0.25;
    const maxMoneyReadinessModifier = 0.25 + 0.75 * moneyPct;

    const maxMoneyPotentialValue = moneyMax * maxMoneyPotentialWeight * maxMoneyReadinessModifier;

    const effectiveMoney = currentMoneyValue + maxMoneyPotentialValue;

    const expectedMoneyPerHackThread = effectiveMoney * hackPctPerThread * hackChance;

    profitScore = expectedMoneyPerHackThread / batchWallTime;
  }

  return {
    hostname,
    profitScore,
    hackChance,
    maxMoney: moneyMax,
    maxTime: batchWallTime,
  };
}

export function performAnalysis(ns: NS, servers: ServerInfo[]): ServerAnalysisReport {
  const analysis: ServerAnalysis[] = [];

  for (const server of servers) {
    const analyzedServer = analyzeTarget(ns, server);

    if (analyzedServer) {
      analysis.push(analyzedServer);
    }
  }

  analysis.sort((a, b) => b.profitScore - a.profitScore);

  return {
    analysis,
    ranAt: Date.now(),
  };
}
