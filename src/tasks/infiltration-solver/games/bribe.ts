import { NEGATIVE_WORDS, POSITIVE_WORDS } from "./bribeWords";

// BribeGame: a single word cycles through a hardcoded list. Press space
// when it's a positive word; press an arrow key to cycle past anything
// else (including the negative list and any in-between idle state).

function findWord(root: Element): string {
  // The cycling word renders inside an h5 (typically). Check h5 first,
  // then fall back to other candidate text containers.
  const tags = ["h5", "h4", "h6", "p", "div", "span"];
  for (const tag of tags) {
    for (const el of Array.from(root.querySelectorAll(tag))) {
      const text = (el.textContent ?? "").trim().toLowerCase();
      if (!text) continue;
      if (POSITIVE_WORDS.has(text) || NEGATIVE_WORDS.has(text)) return text;
    }
  }
  return "";
}

let lastWord = "";

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const word = findWord(root);
  if (!word) return false;
  // The visible word can stay on screen for multiple poll ticks. Once we've
  // acted on it, wait for the word to change before acting again.
  if (word === lastWord) return false;
  lastWord = word;

  if (POSITIVE_WORDS.has(word)) {
    dispatch(" ");
  } else {
    dispatch("ArrowUp");
  }
  return true;
}
