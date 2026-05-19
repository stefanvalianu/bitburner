export function subarrayWithMaximumSum(data: number[]): number {
  if (data.length === 0) return 0;

  let best = data[0]!;
  let current = data[0]!;

  for (let i = 1; i < data.length; i++) {
    const value = data[i]!;
    current = Math.max(value, current + value);
    best = Math.max(best, current);
  }

  return best;
}

export function arrayJumpingGame(data: number[]): 1 | 0 {
  if (data.length <= 1) return 1;

  let farthest = 0;

  for (let i = 0; i <= farthest && i < data.length; i++) {
    farthest = Math.max(farthest, i + data[i]!);

    if (farthest >= data.length - 1) {
      return 1;
    }
  }

  return 0;
}

export function arrayJumpingGameII(data: number[]): number {
  if (data.length <= 1) return 0;

  let jumps = 0;
  let currentEnd = 0;
  let farthest = 0;

  for (let i = 0; i < data.length - 1; i++) {
    farthest = Math.max(farthest, i + data[i]!);

    if (i === currentEnd) {
      if (farthest === i) return 0;

      jumps++;
      currentEnd = farthest;

      if (currentEnd >= data.length - 1) {
        return jumps;
      }
    }
  }

  return 0;
}

export function mergeOverlappingIntervals(data: [number, number][]): [number, number][] {
  if (data.length === 0) return [];

  const intervals = [...data].sort((a, b) => a[0] - b[0]);
  const first = intervals[0]!;

  const merged: [number, number][] = [[first[0], first[1]]];

  for (let i = 1; i < intervals.length; i++) {
    const current = intervals[i]!;
    const previous = merged[merged.length - 1]!;

    if (current[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], current[1]);
    } else {
      merged.push([current[0], current[1]]);
    }
  }

  return merged;
}
