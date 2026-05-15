import { NS } from "@ns";

// constants from the game
const CYCLE_MS = 200;
const TERRITORY_POWER_CYCLES = 100;

// Current source constants:
// normal update: 2000ms / 200ms = 10 cycles
// bonus-time max update: 5000ms / 200ms = 25 cycles
const NORMAL_CYCLES_PER_GANG_UPDATE = 10;
const MAX_CYCLES_PER_GANG_UPDATE = 25;

type GangPowerTerritory = Record<
  string,
  {
    power: number;
    territory: number;
  }
>;

// Helper function to convert ms to a cycle #
function processedMsToCycles(processedMs: number): number {
  return Math.round(processedMs / CYCLE_MS);
}

function didTerritoryOrPowerUpdate(
  before: GangPowerTerritory,
  after: GangPowerTerritory,
): boolean {
  for (const gangName of Object.keys(after)) {
    const oldGang = before[gangName];
    const newGang = after[gangName];

    if (!oldGang || !newGang) return true;

    if (oldGang.power !== newGang.power) return true;
    if (oldGang.territory !== newGang.territory) return true;
  }

  return false;
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
