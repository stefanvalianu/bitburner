import { NS } from "@ns";
import { BaseTask } from "../../../../../common/tasks/baseTask";
import {
  STOCK_TRADER_CONFIG,
  STOCK_TRADER_TASK_ID,
  StockTraderTaskState,
  TradeAction,
  PositionView,
  MarketView,
} from "../public/info";
import { Intent, MarketSnapshot, computeProfitPotential, planTrades } from "./strategy";

class StockTraderTask extends BaseTask<StockTraderTaskState> {
  private readonly commission: number;
  private readonly symbols: string[];

  // Avg buy prices tracked locally per symbol so we can compute realized
  // P&L on partial sells without losing the cost basis (the in-game
  // position avg-price disappears once the position is fully closed).
  private readonly avgPrices = new Map<string, number>();
  private readonly sessionStartedAt: number;

  private realizedPnL = 0;
  private commissionsPaid = 0;
  private tradeCount = 0;
  private winningTrades = 0;
  private losingTrades = 0;
  private recentActions: TradeAction[] = [];

  constructor(ns: NS) {
    super(ns, STOCK_TRADER_TASK_ID);
    this.commission = this.ns.stock.getConstants().StockMarketCommission;
    this.symbols = this.ns.stock.getSymbols();
    this.sessionStartedAt = Date.now();
  }

  protected async run_task(): Promise<void> {
    while (!this.shouldShutdown) {
      if (!this.ns.stock.hasTixApiAccess() || !this.ns.stock.has4SDataTixApi()) {
        this.log.warn("4S Market Data TIX API not available; idling.");
        this.patchState({
          has4SApi: false,
          positions: [],
          market: [],
          recentActions: this.recentActions,
          totals: this.snapshotTotals(),
          sessionStartedAt: this.sessionStartedAt,
          lastTickAt: Date.now(),
        });
        await this.ns.asleep(30_000);
        continue;
      }

      const snapshots = this.buildMarketSnapshots();
      const cash = this.ns.getServerMoneyAvailable("home");
      const reserve =
        this.snapshot.preferences.reservedMoney + STOCK_TRADER_CONFIG.COMMISSION_BUFFER;

      const intents = planTrades(snapshots, cash, {
        enterLong: STOCK_TRADER_CONFIG.ENTER_LONG,
        exitLong: STOCK_TRADER_CONFIG.EXIT_LONG,
        minPosition: STOCK_TRADER_CONFIG.MIN_POSITION,
        commission: this.commission,
        reserve,
      });

      this.executeIntents(intents);
      this.publishState(snapshots);

      await this.ns.stock.nextUpdate();
    }
  }

  private buildMarketSnapshots(): MarketSnapshot[] {
    return this.symbols.map((sym) => {
      const [longShares, longAvgPrice] = this.ns.stock.getPosition(sym);
      if (longShares > 0 && !this.avgPrices.has(sym)) {
        // Reattach to a position opened in a previous run.
        this.avgPrices.set(sym, longAvgPrice);
      }
      return {
        sym,
        forecast: this.ns.stock.getForecast(sym),
        volatility: this.ns.stock.getVolatility(sym),
        askPrice: this.ns.stock.getAskPrice(sym),
        bidPrice: this.ns.stock.getBidPrice(sym),
        maxShares: this.ns.stock.getMaxShares(sym),
        currentShares: longShares,
      };
    });
  }

  private executeIntents(intents: Intent[]): void {
    const now = Date.now();
    for (const intent of intents) {
      if (intent.kind === "buy") {
        const fillPrice = this.ns.stock.buyStock(intent.sym, intent.shares);
        if (fillPrice === 0) continue;

        const [longShares, longAvgPrice] = this.ns.stock.getPosition(intent.sym);
        this.avgPrices.set(intent.sym, longAvgPrice);

        const cost = fillPrice * intent.shares + this.commission;
        this.commissionsPaid += this.commission;
        this.tradeCount += 1;
        this.pushAction({
          kind: "buy",
          sym: intent.sym,
          shares: intent.shares,
          price: fillPrice,
          cost,
          ts: now,
        });
        this.log.info(
          `BUY ${intent.sym} ${intent.shares} @ ${fillPrice.toFixed(2)} (held ${longShares})`,
        );
      } else {
        const fillPrice = this.ns.stock.sellStock(intent.sym, intent.shares);
        if (fillPrice === 0) continue;

        const avg = this.avgPrices.get(intent.sym) ?? fillPrice;
        const gain = fillPrice * intent.shares - this.commission;
        const pnl = (fillPrice - avg) * intent.shares - this.commission;
        this.realizedPnL += pnl;
        this.commissionsPaid += this.commission;
        this.tradeCount += 1;
        if (pnl > 0) this.winningTrades += 1;
        else if (pnl < 0) this.losingTrades += 1;

        const [remaining] = this.ns.stock.getPosition(intent.sym);
        if (remaining === 0) this.avgPrices.delete(intent.sym);

        this.pushAction({
          kind: "sell",
          sym: intent.sym,
          shares: intent.shares,
          price: fillPrice,
          gain,
          pnl,
          ts: now,
        });
        this.log.info(
          `SELL ${intent.sym} ${intent.shares} @ ${fillPrice.toFixed(2)} pnl=${pnl.toFixed(0)}`,
        );
      }
    }
  }

  private pushAction(action: TradeAction): void {
    this.recentActions = [action, ...this.recentActions].slice(
      0,
      STOCK_TRADER_CONFIG.MAX_RECENT_ACTIONS,
    );
  }

  private publishState(snapshots: MarketSnapshot[]): void {
    const positions: PositionView[] = [];
    const market: MarketView[] = [];

    for (const s of snapshots) {
      // Re-read post-trade to reflect any fills this tick.
      const [longShares, longAvgPrice] = this.ns.stock.getPosition(s.sym);
      const profitPotential = computeProfitPotential(s.forecast, s.volatility);

      market.push({
        sym: s.sym,
        forecast: s.forecast,
        volatility: s.volatility,
        askPrice: s.askPrice,
        bidPrice: s.bidPrice,
        maxShares: s.maxShares,
        profitPotential,
      });

      if (longShares > 0) {
        positions.push({
          sym: s.sym,
          shares: longShares,
          avgPrice: longAvgPrice,
          bidPrice: s.bidPrice,
          forecast: s.forecast,
          volatility: s.volatility,
          maxShares: s.maxShares,
        });
      }
    }

    market.sort((a, b) => b.profitPotential - a.profitPotential);
    positions.sort((a, b) => b.shares * b.bidPrice - a.shares * a.bidPrice);

    this.patchState({
      has4SApi: true,
      positions,
      market,
      recentActions: this.recentActions,
      totals: this.snapshotTotals(),
      sessionStartedAt: this.sessionStartedAt,
      lastTickAt: Date.now(),
    });
  }

  private snapshotTotals() {
    return {
      realizedPnL: this.realizedPnL,
      commissionsPaid: this.commissionsPaid,
      tradeCount: this.tradeCount,
      winningTrades: this.winningTrades,
      losingTrades: this.losingTrades,
    };
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new StockTraderTask(ns).start();
}
