export function algorithmicStockTraderI(prices: number[]): number {
  let minPrice = Infinity;
  let best = 0;

  for (const price of prices) {
    minPrice = Math.min(minPrice, price);
    best = Math.max(best, price - minPrice);
  }

  return best;
}

export function algorithmicStockTraderII(prices: number[]): number {
  let profit = 0;

  for (let i = 1; i < prices.length; i++) {
    profit += Math.max(0, prices[i]! - prices[i - 1]!);
  }

  return profit;
}

export function algorithmicStockTraderIII(prices: number[]): number {
  return maxStockProfitWithKTransactions(2, prices);
}

export function algorithmicStockTraderIV([maxTransactions, prices]: [number, number[]]): number {
  return maxStockProfitWithKTransactions(maxTransactions, prices);
}

function maxStockProfitWithKTransactions(k: number, prices: number[]): number {
  if (k <= 0 || prices.length <= 1) return 0;

  if (k >= Math.floor(prices.length / 2)) {
    return algorithmicStockTraderII(prices);
  }

  const buy = Array<number>(k + 1).fill(-Infinity);
  const sell = Array<number>(k + 1).fill(0);

  for (const price of prices) {
    for (let transaction = 1; transaction <= k; transaction++) {
      buy[transaction] = Math.max(buy[transaction]!, sell[transaction - 1]! - price);

      sell[transaction] = Math.max(sell[transaction]!, buy[transaction]! + price);
    }
  }

  return sell[k]!;
}
