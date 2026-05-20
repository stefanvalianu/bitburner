# bitburner

Scripts/features to be used within the game [Bitburner](https://github.com/bitburner-official/bitburner-src). Synchronized to the game using `/tools/sync-server.ts` via manual commands.

## Developer Instructions

### Setup

- Install `just`
- Install `vp`
- To develop on a separate machine, install and bootstrap tailscale `curl -fsSL https://tailscale.com/install.sh | sh`. Otherwise, start with `just run --local`.

### Usage

1. `just run` boots the sync server on `ws://localhost:12525` and a Tailscale Funnel that exposes it publicly as `wss://<host>.<tailnet>.ts.net`. The recipe prints the URL on startup and tears the Funnel down on Ctrl-C. The server stays connected to the game but does not push anything until told to.
2. In Bitburner: **Options → Remote API** -> enable external connection and paste the printed `wss://...` URL (port 443).
3. `just deploy` builds, lints and pushes the changes to the `home` server. Will also delete scripts that are not found in the `/dist` build folder. Run this whenever you want to *apply* changes from code to the game.

### Notes

- DependencyCruiser is used to enforce some dependencies within the code, with the goal of minimizing the chances of unintentionally increasing RAM usage.
- Be mindful that Bitwarden will assume your script is using a RAM-costing function if it sees code literals matching the names of the counted scripts. For example, having a property called "hack" on a type, will cause Bitwarden's linter to assume you are using the hack() function and charge you RAM for it.
- When deploying changes to Bitwarden, RAM increases will need to be confirmed. However, counting RAM is only possible after the scripts get transferred so even if you say "no", the script is still on the server. Be mindful and cognizant of RAM increases.

## Repository Structure

- `/tools` are scripts to aid in local development, not relevant for actual gameplay.
- `/NetscriptDefinitions.d.ts` the synchronized NS SDK from the game.
- `/src` contains the game-relevant scripts.
  - `/features` has features that are meant for UX/rendering. These components would have React dependnecies.
  - `/common` has common code/helpers that are meant to be shared between the UX stack (`/features`) and the task stack (`/tasks`)
  - `/tasks/TASK-NAME` contains task-specific logic. Tasks have their own opinionated sub-structure that must be followed
    - `/public` contains common information from tasks that can be integrated back into the main app shell. Do NOT use new netscript functions in these files.
      - `/info.ts` will contain each individual task definition
      - `/types.ts` will contain all new types introduced by and used by the task
    - `/private` contains the internal task-specific information, custom scripts etc
      - `/task.ts` will contain the task entrypoint, invoked when the allocator creates and runs the task.
  - `/main.tsx` the script entrypoint. All in-game script interaction is marshaled through the main application started by this script.
