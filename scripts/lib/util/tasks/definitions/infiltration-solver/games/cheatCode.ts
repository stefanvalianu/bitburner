// CheatCodeGame: shows the next arrow as a unicode glyph (←↑→↓). The
// player presses the corresponding ArrowLeft/Up/Right/Down. Without the
// TrickeryOfHermes aug only one glyph is visible at a time, so we read,
// dispatch, and let the next poll reveal the new arrow.

const ARROW_KEY: Record<string, string> = {
  "←": "ArrowLeft",
  "↑": "ArrowUp",
  "→": "ArrowRight",
  "↓": "ArrowDown",
};

let lastSignature = "";

function readCurrentArrow(root: Element): { arrow: string; signature: string } | null {
  // The cheat-code grid renders each glyph in its own cell. The current
  // glyph is highlighted (typically a different color) — but the simpler
  // robust read is to scan all text descendants for any of the four arrows
  // and take the first one in document order.
  const walker = (root.ownerDocument ?? document).createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let allGlyphs = "";
  let first: string | null = null;
  while (node) {
    const text = node.nodeValue ?? "";
    for (const ch of text) {
      if (ARROW_KEY[ch]) {
        allGlyphs += ch;
        if (!first) first = ch;
      }
    }
    node = walker.nextNode();
  }
  if (!first) return null;
  return { arrow: first, signature: allGlyphs };
}

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const result = readCurrentArrow(root);
  if (!result) return false;
  // Avoid redispatching while the DOM still shows the just-pressed arrow.
  if (result.signature === lastSignature) return false;
  lastSignature = result.signature;
  dispatch(ARROW_KEY[result.arrow]);
  return true;
}
