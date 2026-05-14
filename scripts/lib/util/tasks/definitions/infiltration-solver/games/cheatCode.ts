// CheatCodeGame ("Enter the Code!"): a horizontal row of <span>s, one per
// arrow in the sequence. Per upstream src/Infiltration/ui/CheatCodeGame.tsx:
//
//   <span style={i !== stage.index ? { opacity: 0.4 } : {}}>
//     {i > stage.index && !hasAugment ? "?" : arrow}
//   </span>
//
// The unique span with no inline opacity is the current arrow. Without
// TrickeryOfHermes, future spans show "?"; with the aug they show real
// glyphs but still at opacity 0.4 — so checking inline opacity is the
// stable signal in both aug states.

const ARROW_KEY: Record<string, string> = {
  "←": "ArrowLeft",
  "↑": "ArrowUp",
  "→": "ArrowRight",
  "↓": "ArrowDown",
};

interface Read {
  arrow: string;
  index: number;
}

function readCurrentArrow(root: Element): Read | null {
  const spans = Array.from(root.querySelectorAll("span")) as HTMLElement[];
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    const text = (s.textContent ?? "").trim();
    const key = ARROW_KEY[text];
    if (!key) continue;
    // React sets style={{}} for the current arrow (no inline opacity) and
    // style={{opacity: 0.4}} for the rest. After JSDOM/React renders,
    // el.style.opacity is "" for the current and "0.4" for others.
    const op = s.style.opacity;
    if (op === "" || op === "1") return { arrow: key, index: i };
  }
  return null;
}

let lastIndex = -1;

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const result = readCurrentArrow(root);
  if (!result) {
    lastIndex = -1;
    return false;
  }
  // Skip if we've already dispatched for this position (DOM not updated
  // between ticks).
  if (result.index === lastIndex) return false;
  lastIndex = result.index;
  dispatch(result.arrow);
  return true;
}
