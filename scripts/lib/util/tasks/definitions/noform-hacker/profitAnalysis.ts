import { NS } from "@ns";
import { ServerInfo } from "../../../dashboardTypes";
import { ServerAnalysis, ServerAnalysisReport } from "./info";

// todo - this
function analyzeTarget(ns: NS, server: ServerInfo): ServerAnalysis | undefined {
  if (server.hostname === "nectar-net") {
    return {
      hostname: server.hostname,
      profitScore: 1,
    };
  }

  return undefined;
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
