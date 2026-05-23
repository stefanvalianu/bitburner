import { BladeburnerActionName, BladeburnerActionType, BladeburnerBlackOpName, NS } from "@ns";
import { ActionInfo, BlackOpsInfo, BladeburnerState, CurrentAction } from "@repo/common/info/bladeburnerInfo";
import { BLADEBURNER_STATE_PORT, getPortData } from "@repo/common/ports";
import { invokeNextScript, updatePartialState } from "@repo/tasks/actionator/core/helpers";

const ACTION_TYPES: Array<"Contracts" | "Operations"> = ["Operations", "Contracts"];

/*
  This script is responsible for:
  - Collecting bladeburner information and publishing it to the state port

  NOTE it is broken up into multiple scripts, since these operations are expensive AF
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));
  
  const state = getPortData<BladeburnerState>(ns, BLADEBURNER_STATE_PORT);
  if (!state) return;

  const actions = readActions(ns);
  const currentAction = readCurrentAction(ns);
  const nextBlackOp = readNextBlackOp(ns);

  updatePartialState<BladeburnerState>(ns, BLADEBURNER_STATE_PORT, {
    ts: Date.now(),
    currentAction,
    actions,
    nextBlackOp,
    skillPoints: ns.bladeburner.getSkillPoints(),
  }, state);
}

function readActions(ns: NS): ActionInfo[] {
  const actions: ActionInfo[] = [];

  for (const type of ACTION_TYPES) {
    const names = type === "Operations" ? ns.bladeburner.getOperationNames() : ns.bladeburner.getContractNames();

    for (const name of names) {
      const [chanceMin, chanceMax] = ns.bladeburner.getActionEstimatedSuccessChance(type, name);
      const level = ns.bladeburner.getActionCurrentLevel(type, name);

      actions.push({
        type,
        name,
        count: ns.bladeburner.getActionCountRemaining(type, name),
        level,
        chanceMin,
        chanceMax,
        timeMs: ns.bladeburner.getActionTime(type, name),
        rankGain: ns.bladeburner.getActionRankGain(type, name, level),
        rankLoss: ns.bladeburner.getActionRankLoss(type, name, level),
      });
    }
  }

  return actions;
}

function readCurrentAction(ns: NS): CurrentAction | null {
  const current = ns.bladeburner.getCurrentAction();

  if (!current || !current.name || !current.type) {
    return null;
  }

  const type = current.type as BladeburnerActionType;
  const name = current.name as BladeburnerActionName;

  return {
    type,
    name,
    currentTimeMs: ns.bladeburner.getActionCurrentTime(),
    totalTimeMs: ns.bladeburner.getActionTime(type, name),
  };
}

function readNextBlackOp(ns: NS): BlackOpsInfo | null {
  const next = ns.bladeburner.getNextBlackOp() as { name: string } | null;

  if (!next) {
    return null;
  }

  const type = "Black Operations";
  const name = next.name as BladeburnerBlackOpName;
  const [chanceMin, chanceMax] = ns.bladeburner.getActionEstimatedSuccessChance(type, name);

  return {
    type,
    name,
    rankRequired: ns.bladeburner.getBlackOpRank(name),
    chanceMin,
    chanceMax,
    timeMs: ns.bladeburner.getActionTime(type, name),
  };
}
