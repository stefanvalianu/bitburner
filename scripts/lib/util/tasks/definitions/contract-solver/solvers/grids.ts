export function spiralizeMatrix(matrix: number[][]): number[] {
  const result: number[] = [];

  if (matrix.length === 0 || matrix[0]?.length === 0) {
    return result;
  }

  let top = 0;
  let bottom = matrix.length - 1;
  let left = 0;
  let right = matrix[0]!.length - 1;

  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) result.push(matrix[top]![c]!);
    top++;

    for (let r = top; r <= bottom; r++) result.push(matrix[r]![right]!);
    right--;

    if (top <= bottom) {
      for (let c = right; c >= left; c--) result.push(matrix[bottom]![c]!);
      bottom--;
    }

    if (left <= right) {
      for (let r = bottom; r >= top; r--) result.push(matrix[r]![left]!);
      left++;
    }
  }

  return result;
}

export function uniquePathsInGridI([rows, cols]: [number, number]): number {
  const dp = Array<number>(cols).fill(1);

  for (let r = 1; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      dp[c] += dp[c - 1]!;
    }
  }

  return dp[cols - 1] ?? 0;
}

export function uniquePathsInGridII(grid: (1 | 0)[][]): number {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  if (rows === 0 || cols === 0 || grid[0]![0] === 1) return 0;

  const dp = Array<number>(cols).fill(0);
  dp[0] = 1;

  for (let r = 0; r < rows; r++) {
    const row = grid[r]!;

    for (let c = 0; c < cols; c++) {
      if (row[c] === 1) {
        dp[c] = 0;
      } else if (c > 0) {
        dp[c] += dp[c - 1]!;
      }
    }
  }

  return dp[cols - 1]!;
}

export function shortestPathInGrid(grid: (1 | 0)[][]): string {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  if (rows === 0 || cols === 0) return "";
  if (grid[0]![0] === 1 || grid[rows - 1]![cols - 1] === 1) return "";

  type State = {
    row: number;
    col: number;
    path: string;
  };

  const directions = [
    { row: 1, col: 0, char: "D" },
    { row: 0, col: 1, char: "R" },
    { row: -1, col: 0, char: "U" },
    { row: 0, col: -1, char: "L" },
  ] as const;

  const seen = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));

  const queue: State[] = [{ row: 0, col: 0, path: "" }];
  seen[0]![0] = true;

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;

    if (current.row === rows - 1 && current.col === cols - 1) {
      return current.path;
    }

    for (const direction of directions) {
      const nextRow = current.row + direction.row;
      const nextCol = current.col + direction.col;

      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
        continue;
      }

      if (seen[nextRow]![nextCol] || grid[nextRow]![nextCol] === 1) {
        continue;
      }

      seen[nextRow]![nextCol] = true;

      queue.push({
        row: nextRow,
        col: nextCol,
        path: current.path + direction.char,
      });
    }
  }

  return "";
}

export function largestRectangleInMatrix(data: (1 | 0)[][]): [[number, number], [number, number]] {
  const rows = data.length;
  const cols = data[0]?.length ?? 0;

  const heights = Array<number>(cols).fill(0);

  let bestArea = 0;
  let best: [[number, number], [number, number]] = [
    [0, 0],
    [0, 0],
  ];

  for (let row = 0; row < rows; row++) {
    const currentRow = data[row]!;

    for (let col = 0; col < cols; col++) {
      heights[col] = currentRow[col] === 0 ? heights[col]! + 1 : 0;
    }

    const stack: number[] = [];

    for (let col = 0; col <= cols; col++) {
      const currentHeight = col === cols ? 0 : heights[col]!;

      while (stack.length > 0 && currentHeight < heights[stack[stack.length - 1]!]!) {
        const heightIndex = stack.pop()!;
        const height = heights[heightIndex]!;
        const left = stack.length === 0 ? 0 : stack[stack.length - 1]! + 1;
        const right = col - 1;
        const area = height * (right - left + 1);

        if (area > bestArea) {
          bestArea = area;
          best = [
            [row - height + 1, left],
            [row, right],
          ];
        }
      }

      stack.push(col);
    }
  }

  return best;
}
