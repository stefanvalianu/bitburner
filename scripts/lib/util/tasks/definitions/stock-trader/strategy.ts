// Pure trading logic. No NS dependency — `planTrades` is a deterministic
// function of (market, cash, config) so it's trivially testable and keeps
// the rules legible separate from the I/O loop in task.ts.

export interface MarketSnapshot {
  sym: string;
  forecast: number;
  volatility: number;
  askPrice: number;
  bidPrice: number;
  maxShares: number;
  currentShares: number;
}

export interface StrategyConfig {
  enterLong: number;
  exitLong: number;
  minPosition: number;
  commission: number;
  reserve: number;
}

export type Intent =
  | { kind: "sell"; sym: string; shares: number }
  | { kind: "buy"; sym: string; shares: number };

export function computeProfitPotential(forecast: number, volatility: number): number {
  return 2 * Math.abs(forecast - 0.5) * volatility;
}

export function planTrades(
  market: MarketSnapshot[],
  cash: number,
  cfg: StrategyConfig,
): Intent[] {
  const intents: Intent[] = [];

  // 1. Exit any held positions whose forecast has crossed the exit floor.
  //    Done before buying so the freed cash can be redeployed this tick.
  let freedCash = 0;
  for (const m of market) {
    if (m.currentShares > 0 && m.forecast <= cfg.exitLong) {
      intents.push({ kind: "sell", sym: m.sym, shares: m.currentShares });
      freedCash += m.currentShares * m.bidPrice - cfg.commission;
    }
  }

  // 2. Rank remaining buy candidates (not currently held, above entry
  //    threshold, with room to grow) by expected return per tick.
  const candidates = market
    .filter(
      (m) =>
        m.forecast > cfg.enterLong &&
        m.currentShares < m.maxShares &&
        (m.currentShares === 0 || m.forecast > cfg.exitLong),
    )
    .map((m) => ({ m, score: computeProfitPotential(m.forecast, m.volatility) }))
    .sort((a, b) => b.score - a.score);

  // 3. Greedily allocate budget across ranked candidates.
  let budget = Math.max(0, cash - cfg.reserve) + freedCash;
  for (const { m } of candidates) {
    if (budget < cfg.minPosition) break;
    const room = m.maxShares - m.currentShares;
    if (room <= 0) continue;

    const affordableShares = Math.floor((budget - cfg.commission) / m.askPrice);
    const shares = Math.min(room, affordableShares);
    if (shares <= 0) continue;

    const cost = shares * m.askPrice + cfg.commission;
    if (cost < cfg.minPosition) continue;

    intents.push({ kind: "buy", sym: m.sym, shares });
    budget -= cost;
  }

  return intents;
}
