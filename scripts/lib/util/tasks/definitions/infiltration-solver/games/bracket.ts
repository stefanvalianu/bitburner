// BracketGame: the prompt shows a string of open brackets like "(([{".
// The player wins by pressing the matching closers in reverse order
// (innermost first). We dispatch all closers in one tick — each keydown
// is processed synchronously by the game's listener, so the chain
// advances atomically.

const CLOSER: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "<": ">",
};

function findOpenBrackets(root: Element): string {
  // The brackets show up as a long monospace-ish line inside the game body.
  // Walk every text-bearing descendant and pick the first textContent that
  // consists entirely of bracket characters.
  const all = root.querySelectorAll("p, span, div, h5, h6");
  for (const el of Array.from(all)) {
    const text = (el.textContent ?? "").trim();
    if (text.length === 0) continue;
    if (/^[([{<]+$/.test(text)) return text;
  }
  return "";
}

let lastDispatched = "";

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const open = findOpenBrackets(root);
  if (!open) return false;
  // Avoid redispatching for the same puzzle (the prompt text persists for a
  // brief moment after we finish before the game transitions to the next).
  if (open === lastDispatched) return false;
  lastDispatched = open;

  let dispatched = false;
  for (let i = open.length - 1; i >= 0; i--) {
    const closer = CLOSER[open[i]];
    if (closer) {
      dispatch(closer);
      dispatched = true;
    }
  }
  return dispatched;
}
