// BackwardGame: prompt is uppercase words like "ALGORITHM BYTE". Without
// the ChaosOfDionysus aug, the prompt <p> has inline style `scaleX(-1)`
// (visually mirrored). With the aug, the transform is "none" and the title
// h4 reads "Type it" instead of "Type it backward". In BOTH states the
// underlying textContent is the correct forward string — typing strategy
// is identical, just read textContent and dispatch each char.
//
// Layout (verified in upstream src/Infiltration/ui/BackwardGame.tsx):
//   <Paper>
//     <h4>Type it backward | Type it</h4>           // 1st h4
//     <p style="transform: scaleX(-1) | none">      // 1st p — the answer
//       ALGORITHM BYTE
//     </p>
//     <p>                                            // 2nd p — the guess
//       {guess}<BlinkingCursor />                    // cursor renders "|" or &nbsp;
//     </p>
//   </Paper>
//
// We dispatch on the transition guess-empty → guess-non-empty. Tracking
// `dispatchedFor` lets us avoid double-firing within one React render
// cycle while still re-firing for consecutive rounds whose answers
// happen to be identical.

function stripCursor(text: string): string {
  // BlinkingCursor renders either "|" (literal pipe) or a non-breaking
  // space; trim() handles whitespace including  , and we strip
  // any remaining pipes before trimming.
  return text.replace(/\|/g, "").trim();
}

function findPromptElements(root: Element): { answer: HTMLElement; guess: HTMLElement } | null {
  const h4 = root.querySelector("h4");
  if (!h4 || !(h4.textContent ?? "").includes("Type it")) return null;

  // The two prompt <p>s are direct children of the same Paper. Walk
  // siblings after the h4 looking for the first two text-bearing <p>s.
  const ps: HTMLElement[] = [];
  let node: Element | null = h4.parentElement;
  if (!node) return null;
  for (const child of Array.from(node.children) as HTMLElement[]) {
    if (child.tagName === "P") ps.push(child);
    if (ps.length === 2) break;
  }
  // Fall back to a paper-wide query if the structure ever changes.
  if (ps.length < 2) {
    const all = Array.from(root.querySelectorAll("p")) as HTMLElement[];
    if (all.length < 2) return null;
    return { answer: all[0], guess: all[1] };
  }
  return { answer: ps[0], guess: ps[1] };
}

let dispatchedFor: string | null = null;

export function step(root: Element, dispatch: (key: string) => void): boolean {
  const els = findPromptElements(root);
  if (!els) {
    dispatchedFor = null;
    return false;
  }
  const answer = (els.answer.textContent ?? "").trim();
  if (!answer) {
    dispatchedFor = null;
    return false;
  }
  const guess = stripCursor(els.guess.textContent ?? "");

  if (guess.length > 0) {
    // Puzzle is in progress (player or solver already typing) — release
    // the gate so the next fresh round can dispatch even if its answer
    // matches the one we just solved.
    dispatchedFor = null;
    return false;
  }

  // Fresh puzzle. Skip if we already dispatched for this exact answer in
  // the same render cycle (DOM hasn't caught up yet).
  if (dispatchedFor === answer) return false;
  for (const ch of answer) dispatch(ch.toLowerCase());
  dispatchedFor = answer;
  return true;
}
