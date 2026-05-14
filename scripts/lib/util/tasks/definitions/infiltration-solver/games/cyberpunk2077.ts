// Cyberpunk2077Game ("Match the symbols"): a grid of 2-char hex symbols
// and a target queue. Cursor highlight is a 2px solid border on the
// current cell (NOT background color or font weight). The aug
// `FloodOfPoseidon` recolors non-target cells to theme.disabled but
// doesn't change the cursor border or the target-queue rendering, so
// the same detector works in both aug states.
//
// Upstream: src/Infiltration/ui/Cyberpunk2077Game.tsx,
//           src/Infiltration/model/Cyberpunk2077Model.ts
//
// DOM shape:
//   <Paper>
//     <h4>Match the symbols!</h4>
//     <h5>Targets:  <span style="color:infolight">A3 </span><span style="color:primary">B7 </span>...</h5>
//     <Box display=grid>
//       <Typography> ... </Typography>   // renders as <p>, one per cell
//     </Box>
//   </Paper>
//
// Keys: ArrowUp/Down/Left/Right; space to select. Grid wraps around
// edges in the model — we don't compute wrapping paths, straight-line
// moves are always correct.

import { getHeadingText } from "../detector";

interface Cell {
  x: number;
  y: number;
  text: string;
  cursor: boolean;
}

interface GridRead {
  cells: Cell[];
  cursor: Cell | null;
  width: number;
  height: number;
  target: string | null;
}

const HEX2 = /^[0-9A-F]{2}$/i;

function readTarget(root: Element, win: Window): string | null {
  // The target queue is an h5 starting with "Targets:". The current
  // target's <span> uses theme.infolight; the rest use theme.primary —
  // colors differ exactly by which span is current. We don't know the
  // theme values, so we identify the current span as the one whose
  // computed color differs from the majority.
  let queueEl: Element | null = null;
  for (const h of Array.from(root.querySelectorAll("h5"))) {
    if ((h.textContent ?? "").includes("Targets")) {
      queueEl = h;
      break;
    }
  }
  if (!queueEl) return null;

  const spans = Array.from(queueEl.querySelectorAll("span")) as HTMLElement[];
  if (spans.length === 0) return null;
  if (spans.length === 1) return (spans[0].textContent ?? "").trim();

  const colors = new Map<string, number>();
  const spanColors: string[] = [];
  for (const s of spans) {
    const c = win.getComputedStyle(s).color;
    spanColors.push(c);
    colors.set(c, (colors.get(c) ?? 0) + 1);
  }
  let majorityColor = "";
  let majorityCount = 0;
  for (const [c, n] of colors) {
    if (n > majorityCount) {
      majorityColor = c;
      majorityCount = n;
    }
  }
  for (let i = 0; i < spans.length; i++) {
    if (spanColors[i] !== majorityColor) {
      return (spans[i].textContent ?? "").trim();
    }
  }
  return null;
}

function readGrid(root: Element): GridRead | null {
  const doc = root.ownerDocument;
  const win = doc?.defaultView;
  if (!win) return null;

  // Cells: <Typography> renders <p>; filter to 2-char hex content.
  const ps = Array.from(root.querySelectorAll("p")) as HTMLElement[];
  const cellEls = ps.filter((p) => HEX2.test((p.textContent ?? "").trim()));
  if (cellEls.length < 4) return null;

  // Cluster by y-coordinate to derive rows (works for any rectangular
  // grid; upstream is always square but rect-clustering is robust).
  type Read = { el: HTMLElement; rectX: number; rectY: number; text: string; cursor: boolean };
  const reads: Read[] = cellEls.map((el) => {
    const rect = el.getBoundingClientRect();
    const cs = win.getComputedStyle(el);
    // Cursor cell has 2px solid border; non-cursor has border=unset
    // which computes to 0px (or "medium"/3px depending on browser — we
    // pin specifically to the inline-style top border width).
    const bw = parseFloat(cs.borderTopWidth || "0");
    return {
      el,
      rectX: rect.left,
      rectY: rect.top,
      text: (el.textContent ?? "").trim(),
      cursor: bw >= 1.5 && bw <= 3,
    };
  });

  reads.sort((a, b) => a.rectY - b.rectY || a.rectX - b.rectX);
  const rowTolerance = 8;
  const rows: Read[][] = [];
  for (const r of reads) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].rectY - r.rectY) <= rowTolerance) last.push(r);
    else rows.push([r]);
  }
  for (const row of rows) row.sort((a, b) => a.rectX - b.rectX);
  const width = rows[0]?.length ?? 0;
  if (width === 0) return null;

  const cells: Cell[] = [];
  let cursor: Cell | null = null;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const r = rows[y][x];
      const cell: Cell = { x, y, text: r.text, cursor: r.cursor };
      cells.push(cell);
      if (r.cursor && !cursor) cursor = cell;
    }
  }

  const target = readTarget(root, win);
  return { cells, cursor, width, height: rows.length, target };
}

let lastSignature = "";

export function step(root: Element, dispatch: (key: string) => void): boolean {
  // Quick rejection — heading text already filtered upstream, but a
  // partial mount may leave us without a complete read.
  if (!getHeadingText(root).includes("Match the symbols")) return false;

  const grid = readGrid(root);
  if (!grid || !grid.cursor) return false;
  if (!grid.target) return false;

  // Strip &nbsp; and surrounding whitespace from the target span.
  const target = grid.target.replace(/[\s ]+/g, "").toUpperCase();
  if (!HEX2.test(target)) return false;

  // Any matching cell is valid (model checks grid[y][x] === target).
  // Pick the closest by Manhattan distance to minimize keypresses.
  const cellText = (s: string) => s.toUpperCase();
  const matches = grid.cells.filter((c) => cellText(c.text) === target);
  if (matches.length === 0) return false;

  let best = matches[0];
  let bestDist = Infinity;
  for (const m of matches) {
    const d = Math.abs(m.x - grid.cursor.x) + Math.abs(m.y - grid.cursor.y);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }

  // Signature combines target + cursor pos so we re-dispatch when the
  // cursor moves or the queue advances, but not when the DOM hasn't
  // updated yet between ticks.
  const sig = `${target}|${grid.cursor.x},${grid.cursor.y}`;
  if (sig === lastSignature) return false;
  lastSignature = sig;

  const dy = best.y - grid.cursor.y;
  const dx = best.x - grid.cursor.x;
  for (let i = 0; i < Math.abs(dy); i++) dispatch(dy > 0 ? "ArrowDown" : "ArrowUp");
  for (let i = 0; i < Math.abs(dx); i++) dispatch(dx > 0 ? "ArrowRight" : "ArrowLeft");
  dispatch(" ");
  return true;
}
