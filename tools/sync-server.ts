import { WebSocketServer, type WebSocket } from "ws";
import chokidar from "chokidar";
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const PORT = Number(process.env.PORT) || 12525;
// We watch the build output, not source. Builds are triggered explicitly via
// `just build`; this server only mirrors dist/ → game.
const DIST_DIR = resolve("dist");
const SERVER = "home";
// Built output is JS only; .ts/.tsx have already been compiled away.
const VALID_EXT = /\.(js|jsx|txt|script)$/i;

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

// Plain ws here; Tailscale Funnel (started by `just run`) terminates TLS at
// the edge and forwards to this port, so external clients see wss://.
const wss = new WebSocketServer({ port: PORT });
console.log(`Listening on ws://localhost:${PORT} (Funnel forwards wss:// → here)\n`);

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
