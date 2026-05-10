import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const MANIFEST_PATH = resolve("script-ram.json");
// Default RAM the game charges every script. Anything at exactly this value
// imports nothing weighty and is mostly noise in the listing — hide unless
// --all is passed.
const BASE_RAM = 1.6;
const EPSILON = 1e-6;
const showAll = process.argv.includes("--all");

// `vp run` strips TTY from the child, so isTTY alone misses interactive use.
// Honor FORCE_COLOR/NO_COLOR so the justfile can opt in explicitly while
// piping (`vp run ram | cat`) still gets plain output.
const useColor =
  !process.env.NO_COLOR && (process.env.FORCE_COLOR === "1" || !!process.stdout.isTTY);

type Rgb = [number, number, number];
const GREEN: Rgb = [34, 197, 94];
const NEUTRAL: Rgb = [160, 160, 160];
const RED: Rgb = [239, 68, 68];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Percentile is rank-based, 0 (lowest RAM) → 1 (highest RAM).
// Bottom 20% pure green, top 20% pure red, middle 40–60% pure neutral; the
// 20–40% and 60–80% bands lerp so the gradient feels smooth.
function colorFor(percentile: number): Rgb {
  if (percentile <= 0.2) return GREEN;
  if (percentile <= 0.4) return lerpRgb(GREEN, NEUTRAL, (percentile - 0.2) / 0.2);
  if (percentile <= 0.6) return NEUTRAL;
  if (percentile <= 0.8) return lerpRgb(NEUTRAL, RED, (percentile - 0.6) / 0.2);
  return RED;
}

function paint(text: string, [r, g, b]: Rgb): string {
  if (!useColor) return text;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[0m`;
}

function tagFor(filename: string): string {
  if (filename === "dashboard.js") return "[entrypoint]";
  if (filename.endsWith("/task.js")) return "[task]";
  if (filename.startsWith("lib/util/script/")) return "[atomic]";
  return "";
}

async function main(): Promise<void> {
  let manifest: Record<string, number>;
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Record<string, number>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`${MANIFEST_PATH} not found. Run \`just deploy\` first.`);
      process.exit(1);
    }
    throw e;
  }

  const allEntries = Object.entries(manifest);
  if (allEntries.length === 0) {
    console.log("No scripts tracked.");
    return;
  }

  const entries = showAll
    ? allEntries
    : allEntries.filter(([, ram]) => Math.abs(ram - BASE_RAM) >= EPSILON);
  const hidden = allEntries.length - entries.length;
  if (entries.length === 0) {
    console.log(`All ${allEntries.length} scripts are at base RAM (${BASE_RAM} GB).`);
    console.log("Run `just ram --all` to list them.");
    return;
  }

  entries.sort((a, b) => b[1] - a[1]);

  const N = entries.length;
  const nameWidth = Math.max(...entries.map(([f]) => f.length));
  for (let i = 0; i < N; i++) {
    const [filename, ram] = entries[i];
    // Sorted descending, so i=0 is highest (percentile 1). Single-entry
    // case lands in the neutral band rather than picking an extreme.
    const percentile = N === 1 ? 0.5 : 1 - i / (N - 1);
    const ramStr = `${ram.toFixed(2)} GB`.padStart(10);
    const tag = tagFor(filename);
    const tagPart = tag ? `  ${tag}` : "";
    console.log(paint(`${filename.padEnd(nameWidth)}  ${ramStr}${tagPart}`, colorFor(percentile)));
  }
  console.log("");
  console.log(`${N} script${N === 1 ? "" : "s"}`);
  if (hidden > 0) {
    console.log(`(${hidden} more at base RAM hidden; \`just ram --all\` to show.)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
