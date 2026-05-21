import { DashboardState } from "../../../dashboardTypes";
import { TaskDefinition, TaskState } from "../../../../../common/tasks/types";

export const STOCK_TRADER_TASK_ID = "stock-trader";

// Pure data per held long position. Display values (unrealized P&L,
// percentages, allocation share) are computed in the panel.
export interface PositionView {
  sym: string;
  shares: number;
  avgPrice: number;
  bidPrice: number;
  forecast: number;
  volatility: number;
  maxShares: number;
}

// Per-symbol view of the market this tick. `profitPotential` is the raw
// 2*|f-0.5|*v ranking metric — surfaced (not derived in UI) because the
// strategy uses it directly and the panel sorts by it.
export interface MarketView {
  sym: string;
  forecast: number;
  volatility: number;
  askPrice: number;
  bidPrice: number;
  maxShares: number;
  profitPotential: number;
}

export type TradeAction =
  | { kind: "buy"; sym: string; shares: number; price: number; cost: number; ts: number }
  | {
      kind: "sell";
      sym: string;
      shares: number;
      price: number;
      gain: number;
      pnl: number;
      ts: number;
    };

export interface StockTraderTotals {
  realizedPnL: number;
  commissionsPaid: number;
  tradeCount: number;
  winningTrades: number;
  losingTrades: number;
}

export interface StockTraderTaskState extends TaskState {
  positions: PositionView[];
  market: MarketView[];
  recentActions: TradeAction[];
  totals: StockTraderTotals;
  // ms epoch the task started its current session — used by the panel
  // to compute realized P&L per hour. Reset on task restart (in-memory only).
  sessionStartedAt: number;
  lastTickAt: number;
  has4SApi: boolean;
}

export const STOCK_TRADER_CONFIG = {
  // Hysteresis band: enter at 0.55, exit at 0.50. The 0.05 gap is
  // load-bearing — it prevents commission-bleeding flip-flops when a
  // forecast oscillates around 0.5.
  ENTER_LONG: 0.55,
  EXIT_LONG: 0.5,

  // 100x commission. Anything smaller is commission-dominated.
  MIN_POSITION: 10_000_000,

  // Added on top of preferences.reservedMoney so the trader always
  // leaves enough headroom to cover round-trip fees on existing positions.
  COMMISSION_BUFFER: 10_000_000,

  MAX_RECENT_ACTIONS: 30,
} as const;

export const stockTraderTask: TaskDefinition = {
  id: STOCK_TRADER_TASK_ID,
  description: "Trades stocks using 4S forecast/volatility to maximize EV per tick.",
  category: "general",
  icon: "📈",
  autostart: false,
  demand: {
    priority: "normal",
  },
};

export function getStockTraderState(state: DashboardState): StockTraderTaskState | undefined {
  if (!state.tasks) return undefined;
  return state.tasks[STOCK_TRADER_TASK_ID] as StockTraderTaskState | undefined;
}
