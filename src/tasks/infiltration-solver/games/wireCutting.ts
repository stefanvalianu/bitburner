// WireCuttingGame ("Cut the wires"): prompt lists 1-N rules. Each rule
// is either "Cut wires colored COLOR" or "Cut wires numbered N", possibly
// combined with "or" (alternative within a rule). Cells in the grid are
// colored via inline `style.color`. A wire's column number is the digit
// the player presses (1-indexed).
//
// KnowledgeOfApollo aug: recolors decoy cells to match the target color,
// breaking color detection. Fallback: if color-only rules find no matches
// but the prompt mentions a number rule too, restrict to number rule.

type ColorName = "red" | "blue" | "yellow" | "white";

const COLOR_TO_NAME: Array<[RegExp, ColorName]> = [
  [/red|rgb\(\s*255,\s*0,\s*0\s*\)/i, "red"],
  [/blue|rgb\(\s*0,\s*0,\s*255\s*\)/i, "blue"],
  [/yellow|#ffc107|rgb\(\s*255,\s*193,\s*7\s*\)/i, "yellow"],
  [/white|rgb\(\s*255,\s*255,\s*255\s*\)/i, "white"],
];

function cssToName(css: string): ColorName | null {
  for (const [re, name] of COLOR_TO_NAME) if (re.test(css)) return name;
  return null;
}

interface Rules {
  colors: Set<ColorName>;
  numbers: Set<number>;
}

function parseRules(root: Element): Rules {
  // Upstream renders each rule in its own <Typography>. The model's
  // toString templates are SINGULAR:
  //   `Cut wire number ${n}.`
  //   `Cut all wires colored ${COLOR}.`
  // (See src/Infiltration/model/WireCuttingModel.ts.) So two number
  // rules render as two separate sentences — there's no "3 and 7" syntax
  // we can grep for. We extract every occurrence of each template
  // independently.
  const text = root.textContent ?? "";
  const colors = new Set<ColorName>();
  const numbers = new Set<number>();
  const colorRe = /colou?red\s+(red|blue|yellow|white)/gi;
  let m: RegExpExecArray | null;
  while ((m = colorRe.exec(text)) !== null) {
    colors.add(m[1].toLowerCase() as ColorName);
  }
  const numRe = /wire\s+number\s+([0-9])/gi;
  while ((m = numRe.exec(text)) !== null) {
    numbers.add(Number(m[1]));
  }
  return { colors, numbers };
}

interface WireColumn {
  index: number; // 1-based wire number
  colors: Set<ColorName>;
  numbers: Set<number>;
}

function readWires(root: Element): WireColumn[] {
  // Wires render as a grid: rows of cells, each cell colored. The header
  // row holds the column numbers. We detect wires by clustering all
  // text-bearing leaves by x-coordinate; each column = one wire.
  const all = Array.from(root.querySelectorAll("span, p")) as HTMLElement[];
  type Leaf = { el: HTMLElement; x: number; y: number; text: string; color: ColorName | null };
  const leaves: Leaf[] = [];
  for (const el of all) {
    const text = (el.textContent ?? "").trim();
    if (text.length === 0 || text.length > 3) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const win = el.ownerDocument!.defaultView!;
    const cs = win.getComputedStyle(el);
    leaves.push({ el, x: rect.left, y: rect.top, text, color: cssToName(cs.color) });
  }
  if (leaves.length === 0) return [];

  // Cluster x positions into columns.
  leaves.sort((a, b) => a.x - b.x);
  const colTolerance = 12;
  const cols: Leaf[][] = [];
  for (const l of leaves) {
    const last = cols[cols.length - 1];
    if (last && Math.abs(l.x - last[last.length - 1].x) <= colTolerance) last.push(l);
    else cols.push([l]);
  }

  const wires: WireColumn[] = [];
  for (let i = 0; i < cols.length; i++) {
    const colLeaves = cols[i];
    const colors = new Set<ColorName>();
    const numbers = new Set<number>();
    let header: number | null = null;
    for (const l of colLeaves) {
      if (/^[0-9]$/.test(l.text)) {
        if (header === null) header = Number(l.text);
        numbers.add(Number(l.text));
      }
      if (l.color) colors.add(l.color);
    }
    wires.push({ index: header ?? i + 1, colors, numbers });
  }

  // Some wire grids include extra ASCII-art columns. Keep only columns
  // whose header is a digit 1-9 if at least one such column exists.
  const numbered = wires.filter((w) => /^[1-9]$/.test(String(w.index)));
  return numbered.length >= 2 ? numbered : wires;
}

function pickWires(rules: Rules, wires: WireColumn[]): number[] {
  // Number rules dispatch the digit directly — no need to look up wire
  // metadata. Color rules use the wire's column color. With the
  // KnowledgeOfApollo aug, non-answer wires recolor to disabled (gray),
  // which doesn't appear in our COLOR_TO_NAME map, so they simply don't
  // match — color detection works in both aug states.
  const out = new Set<number>();
  for (const n of rules.numbers) out.add(n);
  for (const w of wires) {
    for (const c of rules.colors) {
      if (w.colors.has(c)) out.add(w.index);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

let lastSignature = "";

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const rules = parseRules(root);
  if (rules.colors.size === 0 && rules.numbers.size === 0) return false;
  const wires = readWires(root);
  if (wires.length === 0) return false;

  const sig = `${[...rules.colors].join(",")}|${[...rules.numbers].join(",")}|${wires.length}`;
  if (sig === lastSignature) return false;

  const picks = pickWires(rules, wires);
  if (picks.length === 0) return false;

  lastSignature = sig;
  for (const n of picks) dispatch(String(n));
  return true;
}
