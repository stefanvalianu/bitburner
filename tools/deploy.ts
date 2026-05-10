import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const CONTROL_PORT = Number(process.env.CONTROL_PORT) || 12526;
const MANIFEST_PATH = resolve("script-ram.json");
// Round-trip jitter from `calculateRam` puts deltas well above this; equality
// within an epsilon avoids "phantom" diffs.
const EPSILON = 1e-6;
// `calculateRam` only runs on script extensions, matching RAM_EXT in
// sync-server.ts. Manifest entries are pruned only when a *script* file is
// gone — we don't track non-scripts to begin with.
const RAM_EXT = /\.(js|jsx|script)$/i;

type DeployResponse = {
  pushed: string[];
  deleted: string[];
  ram: Record<string, number>;
};

type Manifest = Record<string, number>;

async function readManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

async function writeManifest(m: Manifest): Promise<void> {
  const sorted: Manifest = {};
  for (const k of Object.keys(m).sort()) sorted[k] = m[k];
  await writeFile(MANIFEST_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

function fmt(gb: number): string {
  return `${gb.toFixed(2)} GB`;
}

// `vp run` strips TTY from the child, so isTTY alone misses interactive use.
// Honor FORCE_COLOR/NO_COLOR so the justfile can opt in explicitly while
// piping (`vp run deploy | cat`) still gets plain output.
const useColor =
  !process.env.NO_COLOR && (process.env.FORCE_COLOR === "1" || !!process.stdout.isTTY);
const red = (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s);
const green = (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s);

// Renders a braille spinner overwriting the same line via \r. Returns a stop
// function that clears the line, restores the cursor, and detaches the
// SIGINT cleanup hook. When color/TTY isn't available the spinner degrades to
// a single one-shot print so logs and CI runs aren't littered with frames.
function startSpinner(label: string): () => void {
  if (!useColor) {
    process.stdout.write(`${label}...\n`);
    return () => {};
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  process.stdout.write("\x1b[?25l"); // hide cursor
  const timer = setInterval(() => {
    process.stdout.write(`\r${frames[i++ % frames.length]} ${label}`);
  }, 80);
  const cleanup = () => {
    clearInterval(timer);
    process.stdout.write("\r\x1b[K\x1b[?25h"); // clear line + show cursor
  };
  // Keep Ctrl-C from leaving the cursor hidden mid-spin.
  const onSigint = () => {
    cleanup();
    process.exit(130);
  };
  process.once("SIGINT", onSigint);
  return () => {
    process.removeListener("SIGINT", onSigint);
    cleanup();
  };
}

async function callDeploy(): Promise<{ res: Response; body: string }> {
  const stop = startSpinner("deploying");
  try {
    const res = await fetch(`http://127.0.0.1:${CONTROL_PORT}/deploy`, { method: "POST" });
    const body = await res.text();
    return { res, body };
  } finally {
    stop();
  }
}

async function confirm(prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const oldManifest = await readManifest();

  const { res, body } = await callDeploy();
  if (!res.ok) {
    console.error(`Deploy failed (${res.status}): ${body}`);
    process.exit(1);
  }

  const { pushed, deleted, ram } = JSON.parse(body) as DeployResponse;
  console.log(
    `Deployed ${pushed.length} file${pushed.length === 1 ? "" : "s"}, deleted ${deleted.length}.`,
  );

  const newEntries: string[] = [];
  const decreased: { filename: string; before: number; after: number }[] = [];
  const increased: { filename: string; before: number; after: number }[] = [];
  for (const [filename, after] of Object.entries(ram)) {
    const before = oldManifest[filename];
    if (before === undefined) {
      newEntries.push(filename);
    } else if (Math.abs(after - before) < EPSILON) {
      // unchanged
    } else if (after < before) {
      decreased.push({ filename, before, after });
    } else {
      increased.push({ filename, before, after });
    }
  }

  // A manifest entry is considered "removed locally" only when its file is a
  // script that didn't show up in `pushed`. This avoids dropping entries when
  // calculateRam fails (file was pushed but absent from `ram`).
  const pushedSet = new Set(pushed);
  const removed: string[] = [];
  for (const filename of Object.keys(oldManifest)) {
    if (!RAM_EXT.test(filename)) continue;
    if (!pushedSet.has(filename)) removed.push(filename);
  }

  for (const { filename, before, after } of decreased) {
    console.log(green(`  ↓ ${filename}: ${fmt(before)} → ${fmt(after)} (-${fmt(before - after)})`));
  }
  for (const filename of newEntries) {
    console.log(`  + ${filename}: ${fmt(ram[filename])} (new)`);
  }
  for (const filename of removed) {
    console.log(`  - ${filename} (removed)`);
  }

  let acceptedIncreases = false;
  if (increased.length > 0) {
    console.log("");
    console.log(
      red(`RAM increased on ${increased.length} file${increased.length === 1 ? "" : "s"}:`),
    );
    for (const { filename, before, after } of increased) {
      console.log(red(`  ↑ ${filename}: ${fmt(before)} → ${fmt(after)} (+${fmt(after - before)})`));
    }
    console.log("");
    acceptedIncreases = await confirm(
      `Accept ${increased.length} RAM increase${increased.length === 1 ? "" : "s"}? [y/N]: `,
    );
  }

  const next: Manifest = { ...oldManifest };
  for (const filename of newEntries) next[filename] = ram[filename];
  for (const { filename, after } of decreased) next[filename] = after;
  for (const filename of removed) delete next[filename];
  if (acceptedIncreases) {
    for (const { filename, after } of increased) next[filename] = after;
  }

  const changed =
    newEntries.length > 0 ||
    decreased.length > 0 ||
    removed.length > 0 ||
    (acceptedIncreases && increased.length > 0);

  if (changed) {
    await writeManifest(next);
    console.log(`Updated ${MANIFEST_PATH}.`);
  }

  if (increased.length > 0 && !acceptedIncreases) {
    console.warn("");
    console.warn(
      red(
        `⚠  Deployed RAM diverges from script-ram.json on ${increased.length} file${increased.length === 1 ? "" : "s"}:`,
      ),
    );
    for (const { filename, before, after } of increased) {
      console.warn(red(`     ${filename}: deployed=${fmt(after)} recorded=${fmt(before)}`));
    }
    console.warn(red("   Revert your code or rerun and accept to clear."));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
