import { CityName } from "@ns";
import { BladeburnerState, CITIES } from "@repo/common/info/bladeburnerInfo";

const CHAOS_THRESHOLD = 50;

export function chooseCity(state: BladeburnerState): CityName {
  const current = state.cities[state.city];
  const currentScore = cityScore(current.population, current.chaos);

  let best = current;
  let bestScore = currentScore;

  for (const city of CITIES) {
    const candidate = state.cities[city];
    const score = cityScore(candidate.population, candidate.chaos);

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (current.chaos > CHAOS_THRESHOLD && best.name !== current.name) {
    return best.name;
  }

  if (bestScore > currentScore * 1.25) {
    return best.name;
  }

  return current.name;
}

function cityScore(population: number, chaos: number): number {
  if (population <= 0) return 0;

  const chaosPenalty = chaos <= CHAOS_THRESHOLD
    ? 1
    : Math.sqrt(1 + chaos - CHAOS_THRESHOLD);

  return population / chaosPenalty;
}

export function allCitiesBelowChaosThreshold(state: BladeburnerState): boolean {
  return CITIES.every(city => state.cities[city].chaos <= CHAOS_THRESHOLD);
}
