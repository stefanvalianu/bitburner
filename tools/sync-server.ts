import { WebSocketServer, type WebSocket } from "ws";
import { createServer } from "node:http";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, join } from "node:path";

// WS port is exposed publicly via Tailscale Funnel; HTTP control port is bound
// to loopback only so the deploy trigger can't be hit from the funnel.
const WS_PORT = Number(process.env.PORT) || 12525;
const CONTROL_PORT = Number(process.env.CONTROL_PORT) || 12526;
const DIST_DIR = resolve("dist");
const SERVER = "home";
// Built output is JS only; .ts/.tsx have already been compiled away.
const VALID_EXT = /\.(js|jsx|txt|script)$/i;
// Subset of VALID_EXT that the game's calculateRam understands. Plain .txt
// files are data, not scripts, so we skip them.
const RAM_EXT = /\.(js|jsx|script)$/i;
// Runtime-managed state lives under .state/ on the server. Never push or
// delete these — they belong to the running game, not the build.
const isStateFile = (filename: string) => filename.startsWith(".state/");

type RpcResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: unknown };

let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();

function call(ws: WebSocket, method: string, params?: unknown): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

// Game uses POSIX-style paths regardless of host OS.
function toGameFilename(absPath: string): string {
  return relative(DIST_DIR, absPath).split(/[\\/]/).join("/");
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}

async function pushAll(
  ws: WebSocket,
): Promise<{ pushed: string[]; deleted: string[]; ram: Record<string, number> }> {
  const localFiles = new Set<string>();
  const pushed: string[] = [];
  const ramTargets: string[] = [];
  for await (const abs of walk(DIST_DIR)) {
    const filename = toGameFilename(abs);
    if (!VALID_EXT.test(filename)) continue;
    if (isStateFile(filename)) continue;
    localFiles.add(filename);
    const content = await readFile(abs, "utf8");
    await call(ws, "pushFile", { filename, content, server: SERVER });
    console.log(`→ ${filename}`);
    pushed.push(filename);
    if (RAM_EXT.test(filename)) ramTargets.push(filename);
  }

  // Mirror dist/: anything on the server matching our managed extensions but
  // missing locally gets removed. Restricted to VALID_EXT so game-managed
  // files (.lit/.msg/.cct, etc.) are left alone.
  const remote = (await call(ws, "getFileNames", { server: SERVER })) as string[];
  const deleted: string[] = [];
  for (const filename of remote) {
    if (!VALID_EXT.test(filename)) continue;
    if (isStateFile(filename)) continue;
    if (localFiles.has(filename)) continue;
    await call(ws, "deleteFile", { filename, server: SERVER });
    console.log(`✗ ${filename}`);
    deleted.push(filename);
  }

  // Compute static RAM after pushes complete so the game's calculator sees
  // the freshly-written file. One bad file shouldn't fail the deploy — log
  // and skip; the client treats absence as "no data, leave manifest alone".
  const ram: Record<string, number> = {};
  for (const filename of ramTargets) {
    try {
      const cost = (await call(ws, "calculateRam", { filename, server: SERVER })) as number;
      if (typeof cost === "number" && Number.isFinite(cost)) ram[filename] = cost;
    } catch (e) {
      console.error(`calculateRam failed for ${filename}:`, e);
    }
  }

  return { pushed, deleted, ram };
}

let connectedWs: WebSocket | null = null;

const wss = new WebSocketServer({ port: WS_PORT });
console.log(`WS listening on ws://localhost:${WS_PORT} (Funnel forwards wss:// → here)`);

wss.on("connection", async (ws) => {
  if (connectedWs) {
    // Keep one game session at a time — drop the older socket so the newest
    // connection wins. Otherwise stale watchers/RPCs from the previous tab
    // can race the live one.
    connectedWs.close();
  }
  connectedWs = ws;
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

  ws.on("close", () => {
    console.log("Bitburner disconnected.");
    if (connectedWs === ws) connectedWs = null;
    pending.forEach((p) => p.reject(new Error("connection closed")));
    pending.clear();
  });

  // Pull the NS type definitions on connect so intellisense stays aligned with
  // the BN/source-file state of the game we're playing.
  try {
    const defs = (await call(ws, "getDefinitionFile")) as string;
    await writeFile("NetscriptDefinitions.d.ts", defs);
    console.log("✓ NetscriptDefinitions.d.ts written.");
  } catch (e) {
    console.error("Failed to fetch type definitions:", e);
  }
});

// Local-only HTTP control surface. `just deploy` POSTs /deploy here, which
// walks dist/ and pushes every file over the live WS connection.
const control = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/deploy") {
    if (!connectedWs) {
      res.writeHead(503, { "content-type": "text/plain" }).end("Bitburner not connected\n");
      return;
    }
    try {
      const result = await pushAll(connectedWs);
      console.log(
        `Deployed ${result.pushed.length} file${result.pushed.length === 1 ? "" : "s"}, deleted ${result.deleted.length}.`,
      );
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
    } catch (e) {
      console.error("Deploy failed:", e);
      res
        .writeHead(500, { "content-type": "application/json" })
        .end(JSON.stringify({ error: String(e) }));
    }
    return;
  }
  res.writeHead(404).end();
});

control.listen(CONTROL_PORT, "127.0.0.1", () => {
  console.log(`Control listening on http://127.0.0.1:${CONTROL_PORT} (POST /deploy)`);
});
