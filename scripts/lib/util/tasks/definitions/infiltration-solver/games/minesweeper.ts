// MinesweeperGame: two phases via h4 heading.
//   Memory: "Remember all the mines!"  — every cell with a mine shows
//   a MUI <Report /> SVG (data-testid="ReportIcon"). Cursor is hidden.
//   Mark:   "Mark all the mines!"      — cursor cell shows <Close />
//   (data-testid="CloseIcon"); marked cells show <Flag />
//   (data-testid="FlagIcon"). Without HuntOfArtemis the mines are
//   completely hidden in mark phase — we snapshot during memory phase
//   and act from the snapshot.
//
// Cell layout (upstream src/Infiltration/ui/MinesweeperGame.tsx):
//   <Box style="grid-template-columns: repeat(W, 1fr)">
//     <Typography sx={{border: '2px solid <color>'}}>{icon}</Typography>
//     ...
//   </Box>
//
// Critically: when the cursor moves onto a cell the player has already
// marked, the rendered icon is the Flag (marked) — Close (cursor)
// loses priority. So after pressing space the cursor "disappears" from
// the DOM. We track an internal cursor position; we sync it from the
// DOM whenever Close is visible, and fall back to it when it isn't.
//
// Pressing space on a non-mine cell is an INSTANT failure, so the
// internal cursor MUST stay in sync with the model. Each tick dispatches
// at most one key (move OR mark) and updates internalCursor with the
// same arithmetic the upstream model uses.

import { getHeadingText } from "../detector";

interface Pos {
  row: number;
  col: number;
}

interface MineCell extends Pos {
  isMine: boolean;
  isCursor: boolean;
  isMarked: boolean;
}

interface GridRead {
  cells: MineCell[];
  width: number;
  height: number;
}

function readGrid(root: Element): GridRead | null {
  const anyIcon = root.querySelector(
    '[data-testid="ReportIcon"], [data-testid="CloseIcon"], [data-testid="FlagIcon"]',
  );
  if (!anyIcon) return null;
  const anyCell = anyIcon.closest("p");
  if (!anyCell || !anyCell.parentElement) return null;
  const gridBox = anyCell.parentElement as HTMLElement;

  const cellEls = (Array.from(gridBox.children) as HTMLElement[]).filter((c) => c.tagName === "P");
  if (cellEls.length < 4) return null;

  let width = 0;
  const tplCols = gridBox.style.gridTemplateColumns;
  const m = tplCols.match(/repeat\(\s*(\d+)\s*,/);
  if (m) width = Number(m[1]);
  if (width === 0) {
    // Fallback: count cells in the topmost row via rect clustering.
    const tops = cellEls.map((el) => el.getBoundingClientRect().top);
    const first = Math.min(...tops);
    width = tops.filter((t) => Math.abs(t - first) <= 8).length;
  }
  if (width === 0 || cellEls.length % width !== 0) return null;
  const height = cellEls.length / width;

  const cells: MineCell[] = cellEls.map((el, i) => ({
    row: Math.floor(i / width),
    col: i % width,
    isMine: !!el.querySelector('[data-testid="ReportIcon"]'),
    isCursor: !!el.querySelector('[data-testid="CloseIcon"]'),
    isMarked: !!el.querySelector('[data-testid="FlagIcon"]'),
  }));

  return { cells, width, height };
}

let snapshot: Pos[] = [];
let snapSig = "";
let internalCursor: Pos | null = null;

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const heading = getHeadingText(root);
  const grid = readGrid(root);
  if (!grid) {
    // Game is gone or DOM is mid-mount; reset cursor tracking so the
    // next mark phase resyncs cleanly.
    internalCursor = null;
    return false;
  }

  if (heading.includes("Remember")) {
    const mines = grid.cells.filter((c) => c.isMine).map((c) => ({ row: c.row, col: c.col }));
    const sig = `${grid.width}x${grid.height}|${mines.map((m) => `${m.row},${m.col}`).join(";")}`;
    if (sig !== snapSig) {
      snapshot = mines;
      snapSig = sig;
      internalCursor = null;
    }
    return false;
  }

  if (!heading.includes("Mark")) return false;
  if (snapshot.length === 0) return false;

  // Sync internal cursor when visible. Cursor is hidden when the model
  // is on an already-marked cell (Flag wins over Close in priority).
  const visibleCursor = grid.cells.find((c) => c.isCursor);
  if (visibleCursor) {
    internalCursor = { row: visibleCursor.row, col: visibleCursor.col };
  }
  if (!internalCursor) return false;

  // Compute remaining unmarked mines.
  const markedKeys = new Set<string>();
  for (const c of grid.cells) if (c.isMarked) markedKeys.add(`${c.row},${c.col}`);
  const unmarked = snapshot.filter((m) => !markedKeys.has(`${m.row},${m.col}`));
  if (unmarked.length === 0) return false;

  // Nearest unmarked mine by Manhattan distance.
  let target = unmarked[0];
  let bestDist = Infinity;
  for (const m of unmarked) {
    const d = Math.abs(m.row - internalCursor.row) + Math.abs(m.col - internalCursor.col);
    if (d < bestDist) {
      bestDist = d;
      target = m;
    }
  }

  // One step per tick. The model uses non-wrapping +1/-1 arithmetic
  // (modulo for wraparound), so as long as we only move directly toward
  // the target our internal counter matches the model.
  if (internalCursor.col !== target.col) {
    if (internalCursor.col < target.col) {
      dispatch("ArrowRight");
      internalCursor.col++;
    } else {
      dispatch("ArrowLeft");
      internalCursor.col--;
    }
    return true;
  }
  if (internalCursor.row !== target.row) {
    if (internalCursor.row < target.row) {
      dispatch("ArrowDown");
      internalCursor.row++;
    } else {
      dispatch("ArrowUp");
      internalCursor.row--;
    }
    return true;
  }

  // On the mine. Mark it.
  dispatch(" ");
  return true;
}
