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

The dashboard is the only place that calls `ns.getServer` — it polls every server every 10 seconds and exposes the result through React context. Built on top of that snapshot is a **server manager** that decides what the network should be doing and hands out RAM accordingly.

The unit of work is a **task** — a top-level game intent like `"hack"` or (eventually) `"find best target"`. Each task has a relative priority that can depend on the current game state. Tasks are listed in `scripts/lib/util/tasks/registry.ts`.

The manager runs a tick every 30 seconds. On each tick:

1. **Score.** Every task is asked for its current priority weight. Weights are normalized into percentage shares of the network's total free RAM.
2. **Place each controller.** The manager picks a host for each task's controller script. It tries `home` first; if `home` doesn't have enough free RAM, it falls back to the smallest non-home admin server that fits. Higher-priority tasks pick first, so when capacity is tight they get the better hosts. Whatever non-home host a controller lands on is then taken out of the worker pool so the controller and workers don't fight for the same RAM.
3. **Allocate workers.** The remaining eligible servers (admin rights, not `home`, not reserved by a controller) are sorted largest-first. The manager walks tasks in priority order and hands each one whole servers from the front of the list until its RAM budget is met. Each server belongs to exactly one task per tick — no fragmentation.
4. **Skip if unchanged.** If the new placement and allocation are identical to the current ones, nothing is restarted. This lets long-running work (like HWGW cycles) keep going when capacity is stable.
5. **Otherwise rebalance.** The manager kills the previous tasks (and all the worker scripts they spawned), then starts each new task fresh by `ns.exec`-ing its script on the chosen host with its allocation passed in as a JSON string in `ns.args[0]`.

A task script reads its allocation with `readAllocation(ns)` (`scripts/lib/util/tasks/client.ts`), then spawns whatever workers it needs on the assigned hosts. Every time it spawns one, it calls `reportChild(ns, taskId, pid, hostname)` so the manager has a record. On the next rebalance the manager uses those records to clean up the entire task tree — no per-task shutdown handshake.

Adding a new task is one entry in the registry plus a script that follows the read-allocation / report-children contract.
