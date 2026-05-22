export function findLargestPrimeFactor(data: number): number {
  if (data < 2) return data;

  let n = data;
  let factor = 2;
  let largest = 1;

  while (factor * factor <= n) {
    if (n % factor === 0) {
      largest = factor;
      n /= factor;
    } else {
      factor++;
    }
  }

  return Math.max(largest, n);
}

export function totalWaysToSum(data: number): number {
  const ways = Array<number>(data + 1).fill(0);
  ways[0] = 1;

  for (let part = 1; part < data; part++) {
    for (let sum = part; sum <= data; sum++) {
      ways[sum] += ways[sum - part]!;
    }
  }

  return ways[data]!;
}

export function totalWaysToSumII([target, numbers]: [number, number[]]): number {
  const ways = Array<number>(target + 1).fill(0);
  ways[0] = 1;

  for (const number of numbers) {
    for (let sum = number; sum <= target; sum++) {
      ways[sum] += ways[sum - number]!;
    }
  }

  return ways[target]!;
}

export function minimumPathSumInTriangle(triangle: number[][]): number {
  if (triangle.length === 0) return 0;

  const dp = [...triangle[triangle.length - 1]!];

  for (let row = triangle.length - 2; row >= 0; row--) {
    const currentRow = triangle[row]!;

    for (let col = 0; col < currentRow.length; col++) {
      dp[col] = currentRow[col]! + Math.min(dp[col]!, dp[col + 1]!);
    }
  }

  return dp[0]!;
}

export function squareRoot(data: bigint): bigint {
  if (data < 2n) return data;

  let low = 1n;
  let high = data;
  let floor = 1n;

  while (low <= high) {
    const mid = (low + high) / 2n;
    const square = mid * mid;

    if (square === data) {
      return mid;
    }

    if (square < data) {
      floor = mid;
      low = mid + 1n;
    } else {
      high = mid - 1n;
    }
  }

  const ceil = floor + 1n;
  const lowerDistance = data - floor * floor;
  const upperDistance = ceil * ceil - data;

  return upperDistance < lowerDistance ? ceil : floor;
}

export function totalNumberOfPrimes(data: number[]): number {
  if (data.length < 2) return 0;

  let low = data[0]!;
  let high = data[1]!;

  if (low > high) {
    [low, high] = [high, low];
  }

  if (high < 2) return 0;

  low = Math.max(low, 2);

  const limit = Math.ceil(Math.sqrt(high));
  const isCompositeSmall = Array<boolean>(limit + 1).fill(false);
  const smallPrimes: number[] = [];

  for (let n = 2; n <= limit; n++) {
    if (isCompositeSmall[n]) continue;

    smallPrimes.push(n);

    for (let multiple = n * n; multiple <= limit; multiple += n) {
      isCompositeSmall[multiple] = true;
    }
  }

  const isComposite = Array<boolean>(high - low + 1).fill(false);

  for (const prime of smallPrimes) {
    const start = Math.max(prime * prime, Math.ceil(low / prime) * prime);

    for (let multiple = start; multiple <= high; multiple += prime) {
      isComposite[multiple - low] = true;
    }
  }

  let count = 0;

  for (let i = 0; i < isComposite.length; i++) {
    if (!isComposite[i]) count++;
  }

  return count;
}
