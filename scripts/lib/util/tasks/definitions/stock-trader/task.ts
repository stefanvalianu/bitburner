import { NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { STOCK_TRADER_TASK_ID, StockTraderTaskState } from "./info";

class StockTraderTask extends BaseTask<StockTraderTaskState> {
  private readonly transactionFee: number;

  constructor(ns: NS) {
    super(ns, STOCK_TRADER_TASK_ID);

    this.transactionFee = this.ns.stock.getConstants().StockMarketCommission;
  }

  protected async run_task(): Promise<void> {
    while (true) {
      if (this.shouldShutdown) {
        return;
      }

      // we need this. by the time the player is running this script
      // instead of a hacking script, they likely have the money
      const hasTixApi = this.ns.stock.purchaseTixApi();

      if (!hasTixApi) {
        this.log.warn(
          `Cannot properly execute Stock Trader without the tix api, will try again later.`,
        );
        this.ns.sleep(30_000);
        continue;
      }
      const has4SApi = this.ns.stock.purchase4SMarketDataTixApi();

      // requires tix api
      this.ns.stock.buyStock("a", 2);
      this.ns.stock.sellStock("a", 2);
      this.ns.stock.getSymbols();
      this.ns.stock.getMaxShares("a");
      this.ns.stock.getPosition("a");
      this.ns.stock.getPurchaseCost("a", 2, "L");
      this.ns.stock.getSaleGain("a", 3, "L");

      // requires 4s api
      this.ns.stock.getVolatility("a");
      this.ns.stock.getForecast("a");

      // waits until the next stock tick. the timing is variable
      this.ns.stock.nextUpdate();
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new StockTraderTask(ns).start();
}
