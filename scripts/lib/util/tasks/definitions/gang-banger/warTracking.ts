import { NS } from "@ns";
import { GANG_FACTION } from "./task";

// constants from the game
const CYCLE_MS = 200;
const TERRITORY_POWER_CYCLES = 100;

// "safe" enters the Territory Warfare task when the next update could be
// the territory/power update even under bonus-time batching.
// "normal" uses the last observed gang update size. This spends less time
// on Territory Warfare, but can miss if update size jumps from 10 to 25.
const MODE: "safe" | "normal" = "normal";

// Only enable clash when chance to win is at least this % (0-1)
const CLASH_VICTORY_THRESHOLD = 0.95;

// Current source constants:
// normal update: 2000ms / 200ms = 10 cycles
// bonus-time max update: 5000ms / 200ms = 25 cycles
const NORMAL_CYCLES_PER_GANG_UPDATE = 10;
const MAX_CYCLES_PER_GANG_UPDATE = 25;

// Task to manage adding gang power during clashges
const TERRITORY_WARFARE_TASK = "Territory Warfare";

type GangPowerTerritory = Record<
  string,
  {
    power: number;
    territory: number;
  }
>;

export type MemberTasks = Record<string, string>;

interface CycleUpdate {
  lastProcessedCycles: number;
  cyclesSinceTerritoryPowerUpdate: number;

  inWarWindow: boolean;
  preWarTasks: MemberTasks | undefined;
}

// Helper function to convert ms to a cycle #
function processedMsToCycles(processedMs: number): number {
  return Math.round(processedMs / CYCLE_MS);
}

function didTerritoryOrPowerUpdate(before: GangPowerTerritory, after: GangPowerTerritory): boolean {
  for (const gangName of Object.keys(after)) {
    const oldGang = before[gangName];
    const newGang = after[gangName];

    if (!oldGang || !newGang) return true;

    if (oldGang.power !== newGang.power) return true;
    if (oldGang.territory !== newGang.territory) return true;
  }

  return false;
}

function getMemberTasks(ns: NS): MemberTasks {
  let tasks: MemberTasks = {};

  for (const member of ns.gang.getMemberNames()) {
    tasks[member] = ns.gang.getMemberInformation(member).task;
  }

  return tasks;
}

function restoreMemberTasks(ns: NS, tasks: MemberTasks): void {
  const members = ns.gang.getMemberNames();
  for (const [memberName, taskName] of Object.entries(tasks)) {
    if (!members.includes(memberName)) continue;
    ns.gang.setMemberTask(memberName, taskName);
  }
}

function setAllMembersToWar(ns: NS): void {
  for (const member of ns.gang.getMemberNames()) {
    ns.gang.setMemberTask(member, TERRITORY_WARFARE_TASK);
  }
}

function shouldEnableClash(ns: NS, userDefinedThreshold: number | undefined): boolean {
  // user preference is from 1 to 100%
  const victoryThreshold = userDefinedThreshold
    ? userDefinedThreshold / 100
    : CLASH_VICTORY_THRESHOLD;

  for (const [gangName, gangInfo] of Object.entries(ns.gang.getAllGangInformation())) {
    if (gangInfo.territory === 0 || gangName === GANG_FACTION) continue; // this gang isn't clashing with us (or IS us)

    if (ns.gang.getChanceToWinClash(gangName) < victoryThreshold) {
      return false;
    }
  }

  return true;
}

// Waits until just after a real territory/power update has occurred.
// This gives us a reliable phase anchor: cycle 0 of the next 100-cycle window.
export async function syncToTerritoryPowerUpdate(ns: NS): Promise<number> {
  let before = ns.gang.getAllGangInformation();

  while (true) {
    const processedMs = await ns.gang.nextUpdate();
    const processedCycles = processedMsToCycles(processedMs);
    const after = ns.gang.getAllGangInformation();

    if (didTerritoryOrPowerUpdate(before, after)) {
      return processedCycles;
    }

    before = after;
  }
}

export async function continueOrFightWar(
  ns: NS,
  lastProcessedCycles: number,
  cyclesSinceTerritoryPowerUpdate: number,
  inWarWindow: boolean,
  preWarTasks: MemberTasks | undefined,
  userDefinedClashVictoryThreshold: number | undefined,
): Promise<CycleUpdate> {
  const preWarThresholdCycles = getPreWarThresholdCycles(lastProcessedCycles);
  const cyclesUntilTerritoryPowerUpdate = TERRITORY_POWER_CYCLES - cyclesSinceTerritoryPowerUpdate;

  if (!inWarWindow && cyclesUntilTerritoryPowerUpdate <= preWarThresholdCycles) {
    preWarTasks = getMemberTasks(ns);
    setAllMembersToWar(ns);
    inWarWindow = true;

    // turn clashing on or off
    ns.gang.setTerritoryWarfare(shouldEnableClash(ns, userDefinedClashVictoryThreshold));
  }

  const before = ns.gang.getAllGangInformation();
  const processedMs = await ns.gang.nextUpdate();
  const after = ns.gang.getAllGangInformation();
  lastProcessedCycles = processedMsToCycles(processedMs);

  if (didTerritoryOrPowerUpdate(before, after)) {
    cyclesSinceTerritoryPowerUpdate = 0;

    if (inWarWindow) {
      inWarWindow = false;

      if (preWarTasks) {
        restoreMemberTasks(ns, preWarTasks);
        preWarTasks = undefined;
      }
    }

    return {
      lastProcessedCycles,
      cyclesSinceTerritoryPowerUpdate,
      inWarWindow,
      preWarTasks,
    };
  }

  cyclesSinceTerritoryPowerUpdate += lastProcessedCycles;

  // defensive check to catch runaway behavior with war tracking
  if (cyclesSinceTerritoryPowerUpdate > TERRITORY_POWER_CYCLES) {
    if (inWarWindow) {
      inWarWindow = false;

      if (preWarTasks) {
        restoreMemberTasks(ns, preWarTasks);
        preWarTasks = undefined;
      }
    }

    lastProcessedCycles = await syncToTerritoryPowerUpdate(ns);
    cyclesSinceTerritoryPowerUpdate = 0;
  }

  return {
    lastProcessedCycles,
    cyclesSinceTerritoryPowerUpdate,
    inWarWindow,
    preWarTasks,
  };
}

function getPreWarThresholdCycles(lastProcessedCycles: number): number {
  if (MODE === "safe") return MAX_CYCLES_PER_GANG_UPDATE;
  return Math.max(NORMAL_CYCLES_PER_GANG_UPDATE, lastProcessedCycles);
}
