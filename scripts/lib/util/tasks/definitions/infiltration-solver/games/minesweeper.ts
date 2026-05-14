// MinesweeperGame: two phases driven by the h4 heading.
//   1. "Remember all the mines!" — mines are visible as ReportIcons
//      inside the grid. Snapshot their (row, col) positions.
//   2. "Mark all the mines!" — mines hidden; player navigates the cursor
//      (arrow keys) to each remembered mine and presses space to mark it.
//
// We dispatch one key per tick during the mark phase, re-reading the
// cursor position from the DOM each time so we never march based on a
// stale assumption.

import { getHeadingText } from "../detector";

interface Pos {
  row: number;
  col: number;
}

interface GridLayout {
  rows: number;
  cols: number;
  cells: { row: number; col: number; el: Element; isMine: boolean; highlighted: boolean }[];
}

function readGrid(root: Element): GridLayout | null {
  // Mines render with data-testid="ReportIcon". Each grid cell is a square
  // wrapper containing either a ReportIcon or an empty / locked icon.
  // Detect the grid by clustering all icon-bearing wrappers.
  const icons = Array.from(root.querySelectorAll('[data-testid$="Icon"]')) as HTMLElement[];
  if (icons.length < 4) return null;

  type Pos = { el: HTMLElement; x: number; y: number; isMine: boolean; highlighted: boolean };
  const positions: Pos[] = icons.map((el) => {
    const rect = el.getBoundingClientRect();
    const wrapper = el.parentElement;
    let highlighted = false;
    if (wrapper) {
      const win = wrapper.ownerDocument!.defaultView!;
      const cs = win.getComputedStyle(wrapper);
      // Highlighted cell typically has a non-transparent background.
      highlighted =
        cs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        cs.backgroundColor !== "transparent" &&
        cs.backgroundColor !== "";
    }
    return {
      el,
      x: rect.left,
      y: rect.top,
      isMine: el.getAttribute("data-testid") === "ReportIcon",
      highlighted,
    };
  });

  positions.sort((a, b) => a.y - b.y || a.x - b.x);
  const rowGroups: Pos[][] = [];
  const rowTolerance = 8;
  for (const p of positions) {
    const last = rowGroups[rowGroups.length - 1];
    if (last && Math.abs(last[0].y - p.y) <= rowTolerance) last.push(p);
    else rowGroups.push([p]);
  }
  for (const g of rowGroups) g.sort((a, b) => a.x - b.x);

  // The grid is the largest set of equal-length rows.
  const lengthCounts = new Map<number, number>();
  for (const g of rowGroups) lengthCounts.set(g.length, (lengthCounts.get(g.length) ?? 0) + 1);
  let bestLen = 0;
  let bestCount = 0;
  for (const [len, count] of lengthCounts) {
    if (count > bestCount || (count === bestCount && len > bestLen)) {
      bestLen = len;
      bestCount = count;
    }
  }
  if (bestLen < 2) return null;
  const gridRows = rowGroups.filter((g) => g.length === bestLen);
  if (gridRows.length < 2) return null;

  const cells: GridLayout["cells"] = [];
  for (let r = 0; r < gridRows.length; r++) {
    for (let c = 0; c < gridRows[r].length; c++) {
      cells.push({
        row: r,
        col: c,
        el: gridRows[r][c].el,
        isMine: gridRows[r][c].isMine,
        highlighted: gridRows[r][c].highlighted,
      });
    }
  }
  return { rows: gridRows.length, cols: bestLen, cells };
}

let snapshot: Pos[] = [];
let marked: Set<string> = new Set();
let snapshotSignature = "";

function key(p: Pos): string {
  return `${p.row},${p.col}`;
}

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const heading = getHeadingText(root);
  const grid = readGrid(root);
  if (!grid) return false;

  if (heading.includes("Remember")) {
    // Re-take the snapshot every tick during memory phase (cheap; mines
    // don't move). Reset marks for the new round.
    const mines = grid.cells.filter((c) => c.isMine).map((c) => ({ row: c.row, col: c.col }));
    const sig = `${grid.rows}x${grid.cols}|${mines.map(key).join(";")}`;
    if (sig !== snapshotSignature) {
      snapshot = mines;
      marked = new Set();
      snapshotSignature = sig;
    }
    return false;
  }

  if (!heading.includes("Mark")) return false;
  if (snapshot.length === 0) return false;

  // Find current cursor cell.
  const cursor = grid.cells.find((c) => c.highlighted);
  if (!cursor) return false;

  // If on an unmarked mine, mark it.
  const cursorKey = `${cursor.row},${cursor.col}`;
  const onMine = snapshot.some((m) => key(m) === cursorKey);
  if (onMine && !marked.has(cursorKey)) {
    dispatch(" ");
    marked.add(cursorKey);
    return true;
  }

  // Otherwise step toward the nearest unmarked mine.
  let target: Pos | null = null;
  let bestDist = Infinity;
  for (const m of snapshot) {
    if (marked.has(key(m))) continue;
    const d = Math.abs(m.row - cursor.row) + Math.abs(m.col - cursor.col);
    if (d < bestDist) {
      bestDist = d;
      target = m;
    }
  }
  if (!target) return false;

  if (target.row !== cursor.row) {
    dispatch(target.row > cursor.row ? "ArrowDown" : "ArrowUp");
  } else if (target.col !== cursor.col) {
    dispatch(target.col > cursor.col ? "ArrowRight" : "ArrowLeft");
  }
  return true;
}
