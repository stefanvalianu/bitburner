# bitburner

My Bitburner scripts, edited in VS Code.

A tiny WebSocket sync server (`tools/sync-server.ts`) bundles `scripts/` with Vite and pushes the output to the running game via Bitburner's Remote API.

## Setup

- Install `vp`
- Install and bootstrap tailscale `curl -fsSL https://tailscale.com/install.sh | sh`. You'll be connecting to a tailscale funnel (if you want to develop on a separate machine)

## Usage

1. `just run` — boots the bundler in watch mode, the sync server on `ws://localhost:12525`, and a Tailscale Funnel that exposes it publicly as `wss://<host>.<tailnet>.ts.net` if the `--remote` option is provided. The recipe prints the URL on startup and tears the Funnel down on Ctrl-C.
2. In Bitburner: **Options → Remote API** → enable external connection and paste the printed `wss://...` URL (port 443).
3. Write scripts in `scripts/`. Saves are bundled and pushed to the `home` server automatically.

> First time using Funnel? Enable it once for this tailnet at <https://login.tailscale.com/admin/acls> (Funnel node attribute) and run `tailscale up` if needed.

`NS` types are available via `import type { NS } from "@ns"`. The definitions file is overwritten on each game connect, so it stays aligned with whatever version you're playing.
