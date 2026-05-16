import { GangGenInfo, GangMemberInfo, GangTaskStats, NS } from "@ns";
import { GangMember, MemberRank } from "./info";

const MAX_GANG_MEMBERS = 12;
const TERRITORY_DONE = 1 - Number.EPSILON;

// Normal gang processing is usually 10 cycles.
// This is good enough for task selection projection.
const PROJECTION_CYCLES = 10;

interface RatedTask {
  task: GangTaskStats;
  respect: number;
  wanted: number;
  money: number;
  score: number;
}

type GangStage = "recruiting" | "growing" | "money";

interface Assignment {
  member: GangMember;
  task: GangTaskStats;
  respect: number;
  wanted: number;
  money: number;
  score: number;
}

export function assignOptimalGangTasks(ns: NS, members: Record<string, GangMember>): void {
  const gangInfo = ns.gang.getGangInformation();

  const latestMembers: GangMember[] = Object.values(members).map((member) => ({
    info: ns.gang.getMemberInformation(member.info.name),
    rank: member.rank,
  }));

  const tasks = ns.gang
    .getTaskNames()
    .map((taskName) => ns.gang.getTaskStats(taskName))
    .filter((task) => task.name !== "Unassigned")
    .filter((task) => task.name !== "Territory Warfare");

  const productiveTasks = tasks.filter((task) => task.baseRespect > 0 || task.baseMoney > 0);

  const wantedReductionTasks = tasks.filter((task) => task.baseWanted < 0);

  const stage = getGangStage(gangInfo, latestMembers.length);

  const defaultTrainTaskName = "Train Combat";

  const defaultTrainTask = tasks.find((task) => task.name === defaultTrainTaskName);

  if (!defaultTrainTask) {
    throw new Error(`Could not find training task: ${defaultTrainTaskName}`);
  }

  const assignments: Assignment[] = [];

  for (const member of latestMembers) {
    const bestProductive = pickBestProductiveTask(ns, gangInfo, member, productiveTasks, stage);

    const shouldTrain =
      member.rank === 1 &&
      (!bestProductive || (bestProductive.respect <= 0 && bestProductive.money <= 0));

    if (shouldTrain) {
      assignments.push({
        member,
        task: defaultTrainTask,
        respect: 0,
        wanted: 0,
        money: 0,
        score: 0,
      });

      continue;
    }

    if (!bestProductive) {
      assignments.push({
        member,
        task: defaultTrainTask,
        respect: 0,
        wanted: 0,
        money: 0,
        score: 0,
      });

      continue;
    }

    assignments.push({
      member,
      ...bestProductive,
    });
  }

  applyWantedPenaltyGuard(
    ns,
    gangInfo,
    assignments,
    wantedReductionTasks,
    wantedPenaltyTargetForStage(stage),
  );

  for (const assignment of assignments) {
    ns.gang.setMemberTask(assignment.member.info.name, assignment.task.name);
  }
}

function getGangStage(gangInfo: GangGenInfo, memberCount: number): GangStage {
  if (memberCount < MAX_GANG_MEMBERS && Number.isFinite(gangInfo.respectForNextRecruit)) {
    return "recruiting";
  }

  if (gangInfo.territory < TERRITORY_DONE) {
    return "growing";
  }

  return "money";
}

function wantedPenaltyTargetForStage(stage: GangStage): number {
  switch (stage) {
    case "recruiting":
      // Respect rush stage. Do not over-spend on vigilante.
      return 0.9;

    case "growing":
      return 0.95;

    case "money":
      // Late game money should keep the multiplier healthy.
      return 0.99;
  }
}

function pickBestProductiveTask(
  ns: NS,
  gangInfo: GangGenInfo,
  member: GangMember,
  tasks: GangTaskStats[],
  stage: GangStage,
): RatedTask | undefined {
  const rated = tasks.map((task) => rateTask(ns, gangInfo, member, task));

  const maxRespect = Math.max(1, ...rated.map((x) => x.respect));
  const maxMoney = Math.max(1, ...rated.map((x) => x.money));
  const maxWanted = Math.max(1, ...rated.map((x) => Math.max(0, x.wanted)));

  const weights = getObjectiveWeights(stage, member.rank);

  let best: RatedTask | undefined;

  for (const item of rated) {
    const respectScore = item.respect / maxRespect;
    const moneyScore = item.money / maxMoney;
    const wantedCost = Math.max(0, item.wanted) / maxWanted;

    const score =
      weights.respect * respectScore + weights.money * moneyScore - weights.wanted * wantedCost;

    const scored = {
      ...item,
      score,
    };

    if (!best || scored.score > best.score) {
      best = scored;
    }
  }

  return best;
}

function getObjectiveWeights(
  stage: GangStage,
  rank: MemberRank,
): {
  respect: number;
  money: number;
  wanted: number;
} {
  if (stage === "recruiting") {
    return {
      respect: 1,
      money: rank >= 4 ? 0.15 : 0.05,
      wanted: 0.3,
    };
  }

  if (stage === "growing") {
    return {
      respect: rank <= 2 ? 0.85 : 0.65,
      money: rank >= 3 ? 0.45 : 0.25,
      wanted: 0.35,
    };
  }

  return {
    respect: rank <= 2 ? 0.35 : 0.2,
    money: 1,
    wanted: 0.45,
  };
}

function rateTask(
  ns: NS,
  gangInfo: GangGenInfo,
  member: GangMember,
  task: GangTaskStats,
): RatedTask {
  return {
    task,
    respect: ns.formulas.gang.respectGain(gangInfo, member.info, task),
    wanted: ns.formulas.gang.wantedLevelGain(gangInfo, member.info, task),
    money: ns.formulas.gang.moneyGain(gangInfo, member.info, task),
    score: 0,
  };
}

function applyWantedPenaltyGuard(
  ns: NS,
  gangInfo: GangGenInfo,
  assignments: Assignment[],
  wantedReductionTasks: GangTaskStats[],
  targetWantedPenalty: number,
): void {
  if (wantedReductionTasks.length === 0) return;

  let projected = projectGangAfterAssignments(gangInfo, assignments);

  while (projected.wantedPenalty < targetWantedPenalty && projected.wantedLevel > 1) {
    let bestSwap:
      | {
          index: number;
          replacement: RatedTask;
          projectedPenalty: number;
          efficiency: number;
        }
      | undefined;

    for (let i = 0; i < assignments.length; i++) {
      const current = assignments[i];

      if (current.task.baseWanted < 0) continue;

      const bestReducer = pickBestWantedReductionTask(
        ns,
        gangInfo,
        current.member,
        wantedReductionTasks,
      );

      if (!bestReducer) continue;

      const testAssignments = assignments.slice();
      testAssignments[i] = {
        member: current.member,
        ...bestReducer,
      };

      const testProjection = projectGangAfterAssignments(gangInfo, testAssignments);

      const penaltyImprovement = testProjection.wantedPenalty - projected.wantedPenalty;

      if (penaltyImprovement <= 0) continue;

      const opportunityCost = Math.max(0.000001, current.score - bestReducer.score);
      const efficiency = penaltyImprovement / opportunityCost;

      if (!bestSwap || efficiency > bestSwap.efficiency) {
        bestSwap = {
          index: i,
          replacement: bestReducer,
          projectedPenalty: testProjection.wantedPenalty,
          efficiency,
        };
      }
    }

    if (!bestSwap) break;

    assignments[bestSwap.index] = {
      member: assignments[bestSwap.index].member,
      ...bestSwap.replacement,
    };

    projected = projectGangAfterAssignments(gangInfo, assignments);
  }
}

function pickBestWantedReductionTask(
  ns: NS,
  gangInfo: GangGenInfo,
  member: GangMember,
  wantedReductionTasks: GangTaskStats[],
): RatedTask | undefined {
  let best: RatedTask | undefined;

  for (const task of wantedReductionTasks) {
    const rated = rateTask(ns, gangInfo, member, task);

    // Prefer strongest wanted reduction, with money as a small tiebreaker.
    rated.score = -rated.wanted + rated.money * 0.000001;

    if (!best || rated.score > best.score) {
      best = rated;
    }
  }

  return best;
}

function projectGangAfterAssignments(
  gangInfo: GangGenInfo,
  assignments: Assignment[],
): {
  respect: number;
  wantedLevel: number;
  wantedPenalty: number;
} {
  const respectGainPerCycle = assignments.reduce((sum, assignment) => sum + assignment.respect, 0);

  const wantedGainPerCycle = assignments.reduce((sum, assignment) => sum + assignment.wanted, 0);

  const justiceMembers = assignments.filter((assignment) => assignment.task.baseWanted < 0).length;

  const nextRespect = gangInfo.respect + respectGainPerCycle * PROJECTION_CYCLES;

  let nextWanted = gangInfo.wantedLevel;

  // Mirrors the important shape of Gang.processGains().
  if (gangInfo.wantedLevel !== 1 || wantedGainPerCycle >= 0) {
    nextWanted =
      (gangInfo.wantedLevel + wantedGainPerCycle * PROJECTION_CYCLES) *
      (1 - justiceMembers * 0.001);

    if (nextWanted < 1 || (wantedGainPerCycle <= 0 && nextWanted > gangInfo.wantedLevel)) {
      nextWanted = 1;
    }
  }

  return {
    respect: nextRespect,
    wantedLevel: nextWanted,
    wantedPenalty: nextRespect / (nextRespect + nextWanted),
  };
}
