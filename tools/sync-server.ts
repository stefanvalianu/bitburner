import { WebSocketServer, type WebSocket } from "ws";
import chokidar from "chokidar";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT) || 12525;
const SCRIPTS_DIR = resolve("scripts");
// We watch the build output, not source. We bundle scripts/ into dist/ on
// every save (full rebuild, not Vite's incremental watch — Rolldown's watch
// mode produced inconsistent chunk decisions across rebuilds).
const DIST_DIR = resolve("dist");
const SERVER = "home";
// Built output is JS only; .ts/.tsx have already been compiled away.
const VALID_EXT = /\.(js|jsx|txt|script)$/i;

// Serialized full rebuilds with coalescing: if a save arrives mid-build, we
// flag a follow-up build for when the current one finishes. Avoids races and
// guarantees the final state of dist/ matches the final state of scripts/.
let building = false;
let pendingBuild = false;
async function rebuild(): Promise<void> {
  if (building) {
    pendingBuild = true;
    return;
  }
  building = true;
  await new Promise<void>((resolveBuild) => {
    const proc = spawn("vp", ["build"], { stdio: "inherit" });
    proc.on("exit", () => resolveBuild());
  });
  building = false;
  if (pendingBuild) {
    pendingBuild = false;
    await rebuild();
  }
}

// Initial build before opening the WS server, so when the game connects there
// is already something in dist/ to push.
console.log("Running initial build...");
await rebuild();

// Debounce filesystem events — editors often emit several within a few ms.
let debounceTimer: NodeJS.Timeout | null = null;
const sourceWatcher = chokidar.watch(SCRIPTS_DIR, { ignoreInitial: true });
const onSourceChange = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void rebuild(), 50);
};
sourceWatcher.on("add", onSourceChange);
sourceWatcher.on("change", onSourceChange);
sourceWatcher.on("unlink", onSourceChange);

const shutdown = () => {
  sourceWatcher.close();
  process.exit();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

type RpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: unknown };

// We initiate JSON-RPC calls; the game replies asynchronously by `id`. The map
// resolves the right promise when its matching response comes back.
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();

function call(ws: WebSocket, method: string, params?: unknown): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

// Game uses POSIX-style paths regardless of host OS, so normalize separators.
function toGameFilename(absPath: string): string {
  return relative(DIST_DIR, absPath).split(/[\\/]/).join("/");
}

async function pushFile(ws: WebSocket, absPath: string) {
  const filename = toGameFilename(absPath);
  if (!VALID_EXT.test(filename)) return;
  const content = await readFile(absPath, "utf8");
  await call(ws, "pushFile", { filename, content, server: SERVER });
  console.log(`→ ${filename}`);
}

async function deleteFile(ws: WebSocket, absPath: string) {
  const filename = toGameFilename(absPath);
  if (!VALID_EXT.test(filename)) return;
  await call(ws, "deleteFile", { filename, server: SERVER });
  console.log(`✗ ${filename}`);
}

const wss = new WebSocketServer({ port: PORT });
console.log(`Listening for Bitburner on ws://localhost:${PORT}`);
console.log("In-game: Options → Remote API → set port and Connect.\n");

// One Bitburner client at a time. Each connection gets its own watcher; closing
// the socket tears the watcher down so reconnects don't leak handlers.
wss.on("connection", async (ws) => {
  console.log("Bitburner connected.");

  ws.on("message", (data) => {
    let msg: RpcResponse;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(msg.error);
    else p.resolve(msg.result);
  });

  // ignoreInitial: false → on connect, every existing file fires "add" and
  // gets pushed, ensuring the game starts in sync with disk.
  const watcher = chokidar.watch(DIST_DIR, { ignoreInitial: false });
  watcher.on("add", (p) => pushFile(ws, p).catch(console.error));
  watcher.on("change", (p) => pushFile(ws, p).catch(console.error));
  watcher.on("unlink", (p) => deleteFile(ws, p).catch(console.error));

  ws.on("close", () => {
    console.log("Bitburner disconnected.");
    watcher.close();
    pending.forEach((p) => p.reject(new Error("connection closed")));
    pending.clear();
  });

  // Pull the NS type definitions from the running game and overwrite the
  // checked-in placeholder. This keeps intellisense aligned with the game
  // version the user is actually playing (BN/source-file changes can shift it).
  try {
    const defs = (await call(ws, "getDefinitionFile")) as string;
    await writeFile("NetscriptDefinitions.d.ts", defs);
    console.log("✓ NetscriptDefinitions.d.ts written.");
  } catch (e) {
    console.error("Failed to fetch type definitions:", e);
  }
});
