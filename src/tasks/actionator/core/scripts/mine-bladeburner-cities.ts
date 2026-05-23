import { CityName, NS } from "@ns";
import { BladeburnerState, CITIES, CityInfo } from "@repo/common/info/bladeburnerInfo";
import { BLADEBURNER_STATE_PORT, getPortData } from "@repo/common/ports";
import { invokeNextScript, updatePartialState } from "@repo/tasks/actionator/core/helpers";

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

  const city = ns.bladeburner.getCity();
  const cities = readCities(ns, state.cities);

  updatePartialState<BladeburnerState>(ns, BLADEBURNER_STATE_PORT, {
    ts: Date.now(),
    city,
    cities,
    skillPoints: ns.bladeburner.getSkillPoints(),
  }, state);
}

function readCities(ns: NS, baseCities: Record<CityName, CityInfo>): Record<CityName, CityInfo> {
  for (const name of CITIES) {
    baseCities[name] = {
      name,
      population: ns.bladeburner.getCityEstimatedPopulation(name),
      chaos: ns.bladeburner.getCityChaos(name),
      communities: ns.bladeburner.getCityCommunities(name),
    };
  }

  return baseCities;
}
