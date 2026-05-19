// MinesweeperGame: two phases via h4 heading.
//   Memory: "Remember all the mines!" — mine cells show <Report />
//     (data-testid="ReportIcon"). Cursor is hidden. We snapshot the
//     mine positions here.
//   Mark:   "Mark all the mines!"     — cursor cell shows <Close />
//     (data-testid="CloseIcon"); marked cells show <Flag />
//     (data-testid="FlagIcon"). Without HuntOfArtemis the un-marked
//     mines are completely hidden — the snapshot from memory phase is
//     authoritative.
//
// Approach: read the visible cursor once at the start of mark phase,
// then BATCH the entire move + mark sequence for every remaining mine
// in a single tick. JavaScript keydown dispatch is synchronous and the
// model state advances per event, so we can drive the cursor through
// all mines in one pass without re-reading the DOM between presses.
//
// Why batched is more robust than one-key-per-tick: after marking, the
// cursor cell renders <Flag> (marked wins priority over current) — so
// the cursor "disappears" from the DOM. A per-tick walker that tries
// to resync from the DOM gets stuck on that invisible cursor; the
// player ends up having to nudge the cursor manually before the next
// action fires.

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
let dispatchedFor = "";

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const heading = getHeadingText(root);
  const grid = readGrid(root);
  if (!grid) return false;

  if (heading.includes("Remember")) {
    const mines = grid.cells.filter((c) => c.isMine).map((c) => ({ row: c.row, col: c.col }));
    const sig = `${grid.width}x${grid.height}|${mines.map((m) => `${m.row},${m.col}`).join(";")}`;
    if (sig !== snapSig) {
      snapshot = mines;
      snapSig = sig;
      dispatchedFor = "";
    }
    return false;
  }

  if (!heading.includes("Mark")) return false;
  if (snapshot.length === 0) return false;
  // Already dispatched the full sequence for this stage — wait for the
  // game to transition to the next stage (which resets snapSig).
  if (dispatchedFor === snapSig) return false;

  const cursor = grid.cells.find((c) => c.isCursor);
  if (!cursor) return false;

  const markedKeys = new Set<string>();
  for (const c of grid.cells) if (c.isMarked) markedKeys.add(`${c.row},${c.col}`);
  const remaining = snapshot.filter((m) => !markedKeys.has(`${m.row},${m.col}`));
  if (remaining.length === 0) {
    dispatchedFor = snapSig;
    return false;
  }

  // Greedy nearest-neighbor ordering minimizes total keypresses without
  // needing a full TSP solve. Each chosen mine becomes the new cursor
  // origin for the next pick.
  let cx = cursor.col;
  let cy = cursor.row;
  const todo = remaining.slice();
  while (todo.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < todo.length; i++) {
      const d = Math.abs(todo[i].col - cx) + Math.abs(todo[i].row - cy);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const m = todo.splice(bestIdx, 1)[0];

    while (cx < m.col) {
      dispatch("ArrowRight");
      cx++;
    }
    while (cx > m.col) {
      dispatch("ArrowLeft");
      cx--;
    }
    while (cy < m.row) {
      dispatch("ArrowDown");
      cy++;
    }
    while (cy > m.row) {
      dispatch("ArrowUp");
      cy--;
    }
    dispatch(" ");
  }

  dispatchedFor = snapSig;
  return true;
}
