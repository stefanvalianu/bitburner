import { NS } from "@ns";
import { ServerInfo } from "../../../dashboardTypes";
import { ServerAnalysis, ServerAnalysisReport } from "./info";
import { HACK_SCRIPT, GROW_SCRIPT, WEAKEN_SCRIPT } from "../../../script/constants";

const TARGET_HACK_FRACTION = 0.1;

// 60% money is treated as "average readiness".
const AVERAGE_MONEY_PCT = 0.6;
const MONEY_READINESS_WEIGHT = 1.25;

// How much to value max-money potential in addition to current money.
// Keep this modest, otherwise drained high-max servers will dominate.
const MAX_MONEY_POTENTIAL_WEIGHT = 0.25;

// Higher means max-money potential is ignored more aggressively when money is low.
const MAX_MONEY_READINESS_WEIGHT = 1.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function analyzeTarget(ns: NS, server: ServerInfo): ServerAnalysis | undefined {
  // Can't hack servers without admin rights, our own servers, or servers with no money.
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

  if (hackChance <= 0 || hackPctPerThread <= 0) {
    return undefined;
  }

  const hackTime = ns.getHackTime(hostname);
  const weakTime = ns.getWeakenTime(hostname);
  const growTime = ns.getGrowTime(hostname);

  // HWGW scripts overlap. The wall-clock time of a batch is much closer to
  // weaken time than hack + weaken + grow + weaken.
  //
  // If this file has access to BATCH_FRAME_OFFSET_MS, you could use:
  // const batchWallTime = Math.max(hackTime, weakTime, growTime) + 3 * BATCH_FRAME_OFFSET_MS;
  const batchWallTime = Math.max(hackTime, weakTime, growTime);

  if (batchWallTime <= 0) {
    return undefined;
  }

  const hackRam = ns.getScriptRam(HACK_SCRIPT);
  const growRam = ns.getScriptRam(GROW_SCRIPT);
  const weakenRam = ns.getScriptRam(WEAKEN_SCRIPT);

  if (hackRam <= 0 || growRam <= 0 || weakenRam <= 0) {
    return undefined;
  }

  const weakenPerThread = ns.weakenAnalyze(1);

  if (weakenPerThread <= 0) {
    return undefined;
  }

  // Analyze a standard "reference batch" that hacks roughly 10% of the server.
  // This lets us compare targets by money/time/RAM instead of just money/time.
  const hackThreads = Math.max(1, Math.floor(TARGET_HACK_FRACTION / hackPctPerThread));

  const actualHackFraction = clamp(hackThreads * hackPctPerThread, 0, 0.95);

  if (actualHackFraction <= 0) {
    return undefined;
  }

  const growMultiplier = 1 / (1 - actualHackFraction);

  const growThreads = Math.max(1, Math.ceil(ns.growthAnalyze(hostname, growMultiplier)));

  const hackSecurityIncrease = ns.hackAnalyzeSecurity(hackThreads, hostname);
  const growSecurityIncrease = ns.growthAnalyzeSecurity(growThreads, hostname);

  const hackWeakenThreads = Math.max(1, Math.ceil(hackSecurityIncrease / weakenPerThread));

  const growWeakenThreads = Math.max(1, Math.ceil(growSecurityIncrease / weakenPerThread));

  const batchRam =
    hackThreads * hackRam +
    hackWeakenThreads * weakenRam +
    growThreads * growRam +
    growWeakenThreads * weakenRam;

  if (batchRam <= 0) {
    return undefined;
  }

  const moneyPct = clamp(moneyAvailable / moneyMax, 0, 1);

  // Penalize currently-drained servers.
  // At 60% money, this is 1.
  // Below 60%, it falls below 1.
  // Above 60%, it rises above 1.
  const moneyReadinessModifier = Math.pow(moneyPct / AVERAGE_MONEY_PCT, MONEY_READINESS_WEIGHT);

  // Current immediately-hackable value.
  const expectedCurrentMoney = moneyAvailable * actualHackFraction * hackChance;

  const currentValue = expectedCurrentMoney * moneyReadinessModifier;

  // Max-money potential, but only partially counted and penalized by readiness.
  // This prevents empty but high-capacity servers from incorrectly ranking first.
  const maxMoneyReadinessModifier = Math.pow(moneyPct, MAX_MONEY_READINESS_WEIGHT);

  const expectedMaxMoney = moneyMax * actualHackFraction * hackChance;

  const maxMoneyPotentialValue =
    expectedMaxMoney * maxMoneyReadinessModifier * MAX_MONEY_POTENTIAL_WEIGHT;

  const expectedBatchValue = currentValue + maxMoneyPotentialValue;

  // Final rough score:
  //
  // "How much useful money do I expect this target to produce,
  // per millisecond, per GB of RAM?"
  const profitScore = expectedBatchValue / (batchWallTime * batchRam);

  return {
    hostname: hostname,
    profitScore: profitScore,
    hackChance: hackChance,
    maxMoney: moneyMax,
    maxTime: batchWallTime
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
