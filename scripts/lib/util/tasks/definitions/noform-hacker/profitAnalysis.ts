import { NS } from "@ns";
import { ServerInfo } from "../../../dashboardTypes";
import { ServerAnalysis, ServerAnalysisReport } from "./info";

function analyzeTarget(ns: NS, server: ServerInfo): ServerAnalysis | undefined {
  // can't hack servers without admin rights, or our own servers
  if (!server.hasAdminRights || server.purchasedByPlayer) return undefined;

  // 0-1 value indicating our likelihood to succeed the hack
  const hackChance = ns.hackAnalyzeChance(server.hostname);

  // this is very imperfect as it depends on current state, but it tells us how much we'd gain from a hack
  // formulas API allows us to do this more accurately
  const hackProfit = ns.hackAnalyze(server.hostname);

  const hackTime = ns.getHackTime(server.hostname);
  const weakTime = ns.getWeakenTime(server.hostname);
  const growTime = ns.getGrowTime(server.hostname);
  const totalTime = hackTime + weakTime + weakTime + growTime;

  const roughProfitPerSecond = hackChance * (hackProfit / totalTime);

  return {
    hostname: server.hostname,
    profitScore: roughProfitPerSecond,
  };
}

export function performAnalysis(ns: NS, servers: ServerInfo[]): ServerAnalysisReport {
  const analysis: ServerAnalysis[] = [];

  for (const server of servers) {
    const analyzedServer = analyzeTarget(ns, server);

    if (analyzedServer) analysis.push(analyzedServer);
  }

  analysis.sort((a, b) => b.profitScore - a.profitScore);

  return {
    analysis: analysis,
    ranAt: Date.now(),
  };
}
