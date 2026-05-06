# bitburner

My Bitburner scripts, edited in VS Code.

A tiny WebSocket sync server (`tools/sync-server.ts`) bundles `scripts/` with Vite and pushes the output to the running game via Bitburner's Remote API.

## Usage

1. `just run` — boots the bundler in watch mode and the sync server on `ws://localhost:12525`.
2. In Bitburner: **Options → Remote API**, set port to `12525`, click **Connect**.
3. Write scripts in `scripts/`. Saves are bundled and pushed to the `home` server automatically.

`NS` types are available via `import type { NS } from "@ns"`. The definitions file is overwritten on each game connect, so it stays aligned with whatever version you're playing.
