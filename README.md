# bitburner

My Bitburner scripts, edited in VS Code.

A tiny WebSocket sync server (`tools/sync-server.ts`) bundles `scripts/` with Vite and pushes the output to the running game via Bitburner's Remote API.

## Setup

- Install `vp`
- Install and bootstrap tailscale `curl -fsSL https://tailscale.com/install.sh | sh`. You'll be connecting to a tailscale funnel (if you want to develop on a separate machine)

## Usage

1. `just run` — boots the sync server on `ws://localhost:12525` and a Tailscale Funnel that exposes it publicly as `wss://<host>.<tailnet>.ts.net`. The recipe prints the URL on startup and tears the Funnel down on Ctrl-C. The server stays connected to the game but does not push anything until told to.
2. In Bitburner: **Options → Remote API** → enable external connection and paste the printed `wss://...` URL (port 443).
3. `just build` — bundles `scripts/` into `dist/`.
4. `just deploy` — pushes the current `dist/` to the `home` server. Run this whenever you want to ship changes; the sync server must be running and the game must be connected.

> First time using Funnel? Enable it once for this tailnet at <https://login.tailscale.com/admin/acls> (Funnel node attribute) and run `tailscale up` if needed.

`NS` types are available via `import type { NS } from "@ns"`. The definitions file is overwritten on each game connect, so it stays aligned with whatever version you're playing.

## Script Concepts

The goal of this system is to heavily rely on React for building useful, tangible experiences to make playing the game and monitoring its state easier than baseline.

The main UX entrypoint will be the `dashboard` script, which will actually exist for various RAM sizes to facilitate early game through to late game. In general, use the biggest script your home machine can support.

Scripts that are deployed to home via a repository sync are also copied to all available nodes via a propagation script. This ensures that all scripts, libraries, etc are available on all machines. The version of the code available will be stamped in the home dashboard; this a Linux epoch timestamp and will update once propagation of new scripts are finished.

- This is done by stamping an epoch timestamp on each build. Each build produces a new version.txt
- The dashboard checks whether its last propagated version is older than the current version. If so, it runs the `scripts/propagate.js` script.

### Core Components

- There is a core logger hook available to all scripts which will use the `port` system to write logs that are consumed by a centralized component. To use logging in this system, simply call `useLogger()` from `scripts/lib/log.ts`.
- There is a library of standard, reusable UX components in `scripts/lib/ui`

### Tools

- Tools are a set of programs available to the user; these are needed to make progress in the early game (opening ports, etc). These are explicitly tracked as items in the dashboard, as the player has to manually purchase these in the early game.

### Servers

- Servers are also tracked explicitly, and a server map is provided for convenience and status at a glance. The dashboard system will periodically attempt to nuke (and evenutally backdoor) servers as the player's hacking level and available tools enables new hacks

### Tasks and the server manager

A central **task manager** runs every 10 seconds inside the dashboard. It owns the authoritative state for every task in `scripts/lib/util/tasks/definitions.ts`, decides which ones should be running based on each task's `needsRerun` predicate, and publishes a single per-task state snapshot to a port that tasks `peek`. Tasks emit events back through a second port to update their own slots and announce spawned workers.

Shutdown is **cooperative**: when conditions change, the manager flips `shutdownRequested = true` in the task's state and waits for it to exit cleanly on the next tick before respawning. Tasks own their own teardown.

See [`docs/task-system.md`](docs/task-system.md) for the full architecture — lifecycle states, the tick loop, port semantics, and how to add a new task.
