import { InfilGameId } from "./info";

// Each minigame mounts an <h4> with one of these prompt strings. We match
// substrings to be resilient against tier-variant text. The heading also
// changes within a single game (e.g. Slash flips between "Guarding ...",
// "Distracted!" and "Alerted!") — those subphase reads happen inside the
// per-game step() functions.
// Needles match the upstream h4 strings. A couple of them flip based on
// player augmentations (e.g. ChaosOfDionysus turns "Type it backward"
// into just "Type it"), so the needles are kept as short common-prefix
// substrings rather than full sentences.
const GAME_HEADINGS: Array<{ id: InfilGameId; needles: string[] }> = [
  { id: "slash", needles: ["Guarding", "Distracted", "Alerted"] },
  { id: "bracket", needles: ["Close the brackets"] },
  { id: "backward", needles: ["Type it"] }, // "Type it" | "Type it backward"
  { id: "bribe", needles: ["Say something nice"] },
  { id: "cheatCode", needles: ["Enter the Code"] }, // upstream: "Enter the Code!"
  { id: "cyberpunk2077", needles: ["Match the symbols"] },
  { id: "minesweeper", needles: ["Remember all the mines", "Mark all the mines"] },
  { id: "wireCutting", needles: ["Cut the wires"] },
];

export function findInfiltrationRoot(doc: Document): Element | null {
  // The infiltration UI sits inside an MUI Paper. Find any <h4> whose text
  // matches a known prompt, then climb to the enclosing Paper.
  const headings = doc.querySelectorAll("h4");
  for (const h of Array.from(headings)) {
    const text = h.textContent ?? "";
    for (const entry of GAME_HEADINGS) {
      for (const needle of entry.needles) {
        if (text.includes(needle)) {
          return h.closest(".MuiPaper-root") ?? h.parentElement ?? h;
        }
      }
    }
  }
  return null;
}

export function identify(root: Element): InfilGameId | null {
  const heading = root.querySelector("h4");
  const text = heading?.textContent ?? "";
  for (const entry of GAME_HEADINGS) {
    for (const needle of entry.needles) {
      if (text.includes(needle)) return entry.id;
    }
  }
  return null;
}

export function getHeadingText(root: Element): string {
  return root.querySelector("h4")?.textContent ?? "";
}
