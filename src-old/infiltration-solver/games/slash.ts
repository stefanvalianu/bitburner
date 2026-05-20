import { getHeadingText } from "../detector";

// SlashGame cycles the heading between "Guarding ...", "Distracted!", and
// (on miss) "Alerted!". The only winning input is space, and only during
// "Distracted!". Pressing during "Guarding" loses the stage. Brutal-tier
// window is ~250ms; the task's 30ms poll comfortably fits inside that.
export function step(root: Element, dispatch: (key: string) => void): boolean {
  const heading = getHeadingText(root);
  if (heading.includes("Distracted")) {
    dispatch(" ");
    return true;
  }
  return false;
}
