// Cyberpunk2077Game ("Match the symbols"): a grid of symbols + a target
// sequence. Move the cursor with arrows, press space on the current target
// symbol, repeat until the sequence is empty.
//
// Approach: read the full grid each tick, locate the cursor cell (the
// highlighted one), find where the head-of-queue target symbol lives in
// the grid, dispatch the arrow + space sequence in one tick. We do NOT
// compute wrapping paths — straight-line moves work for any grid.

interface Cell {
  row: number;
  col: number;
  text: string;
  highlighted: boolean;
}

interface GridRead {
  cells: Cell[];
  cols: number;
  rows: number;
  cursor: Cell | null;
  target: string;
}

function readGrid(root: Element): GridRead | null {
  // The grid is a flex/grid container of cells. The most reliable read is
  // to find the largest cluster of single-character "symbol" cells. Each
  // cell appears as a styled <span> or <p> inside its own wrapper.
  // We accept any text-bearing leaf whose textContent is a single non-
  // whitespace character.
  const all = Array.from(root.querySelectorAll("span, p")) as HTMLElement[];
  const symbolNodes: HTMLElement[] = [];
  for (const el of all) {
    const text = (el.textContent ?? "").trim();
    if (text.length !== 1) continue;
    if (text === "?" || text === "+") continue;
    symbolNodes.push(el);
  }
  if (symbolNodes.length < 4) return null;

  // Cluster cells into rows by their top offset.
  type Pos = { el: HTMLElement; x: number; y: number; text: string };
  const positions: Pos[] = symbolNodes.map((el) => {
    const rect = el.getBoundingClientRect();
    return { el, x: rect.left, y: rect.top, text: (el.textContent ?? "").trim() };
  });

  // Group by y (with tolerance), then within each y group sort by x.
  positions.sort((a, b) => a.y - b.y || a.x - b.x);
  const rowGroups: Pos[][] = [];
  const rowTolerance = 8;
  for (const p of positions) {
    const last = rowGroups[rowGroups.length - 1];
    if (last && Math.abs(last[0].y - p.y) <= rowTolerance) last.push(p);
    else rowGroups.push([p]);
  }
  for (const g of rowGroups) g.sort((a, b) => a.x - b.x);

  // Take the densest set of equal-length rows as the grid (excludes the
  // target-sequence row, which renders separately and has a different
  // count from the symbol grid).
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

  const cells: Cell[] = [];
  let cursor: Cell | null = null;
  for (let r = 0; r < gridRows.length; r++) {
    for (let c = 0; c < gridRows[r].length; c++) {
      const p = gridRows[r][c];
      const style = p.el.ownerDocument!.defaultView!.getComputedStyle(p.el);
      const parentStyle = p.el.parentElement
        ? p.el.parentElement.ownerDocument!.defaultView!.getComputedStyle(p.el.parentElement)
        : null;
      const highlighted =
        style.fontWeight === "700" ||
        style.fontWeight === "bold" ||
        (parentStyle?.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          parentStyle?.backgroundColor !== "transparent" &&
          parentStyle?.backgroundColor !== "" &&
          parentStyle?.backgroundColor != null);
      const cell: Cell = { row: r, col: c, text: p.text, highlighted };
      cells.push(cell);
      if (highlighted && !cursor) cursor = cell;
    }
  }

  // Find the target sequence: a row of symbols that's NOT the grid (typically
  // a separate row above the grid with all the targets in sequence).
  let target = "";
  for (const g of rowGroups) {
    if (g.length === bestLen) continue;
    target = g.map((p) => p.text).join("");
    if (target.length > 0) break;
  }

  return { cells, cols: bestLen, rows: gridRows.length, cursor, target };
}

let lastTarget = "";

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const grid = readGrid(root);
  if (!grid || !grid.cursor || !grid.target) return false;

  // Avoid re-dispatching for the same target until the DOM updates.
  if (grid.target === lastTarget) return false;
  lastTarget = grid.target;

  const next = grid.target[0];
  const targetCell = grid.cells.find((c) => c.text === next);
  if (!targetCell) return false;

  const dr = targetCell.row - grid.cursor.row;
  const dc = targetCell.col - grid.cursor.col;
  const rowKey = dr > 0 ? "ArrowDown" : "ArrowUp";
  const colKey = dc > 0 ? "ArrowRight" : "ArrowLeft";
  for (let i = 0; i < Math.abs(dr); i++) dispatch(rowKey);
  for (let i = 0; i < Math.abs(dc); i++) dispatch(colKey);
  dispatch(" ");
  return true;
}
