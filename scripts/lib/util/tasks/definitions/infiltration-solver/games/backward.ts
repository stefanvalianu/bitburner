// BackwardGame: the prompt is rendered with CSS `transform: scaleX(-1)` so
// the player sees mirrored text. The underlying textContent is the normal
// left-to-right string and is also the required input. We dispatch each
// character in one tick.

function findPromptText(root: Element): string {
  // The prompt is the largest text block inside the body — typically rendered
  // in an h4/h5 sibling of the heading. Walk candidates and take the longest
  // string of A-Z letters/spaces.
  const candidates = root.querySelectorAll("h4, h5, h6, p, span, div");
  let best = "";
  for (const el of Array.from(candidates)) {
    const text = (el.textContent ?? "").trim();
    if (!/^[A-Z ]+$/.test(text)) continue;
    if (text.length > best.length) best = text;
  }
  return best;
}

let lastDispatched = "";

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const text = findPromptText(root);
  if (!text) return false;
  if (text === lastDispatched) return false;
  lastDispatched = text;

  for (const ch of text) {
    dispatch(ch.toLowerCase());
  }
  return true;
}
