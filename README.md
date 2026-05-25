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
- We cannot use React's lazy() features because they access both the document and the window dom objects, increasing script RAM usage by 50gb.

## Repository Structure

- `/tools` are scripts to aid in local development, not relevant for actual gameplay.
- `/NetscriptDefinitions.d.ts` the synchronized NS SDK from the game.
- `/src` contains the game-relevant scripts.
  - `/features` has features that are meant for UX/rendering. These components would have React dependnecies.
  - `/common` has common code/helpers that are meant to be shared between the UX stack (`/features`) and the task stack (`/tasks`)
  - `/tasks/TASK-NAME` contains task-specific logic. Tasks have their own opinionated sub-structure that must be followed
    - `/info.ts` will contain each individual task definition alongside any types introduced by the task (state, etc)
    - `/core` contains the internal task-specific information, custom scripts etc
      - `/task.ts` will contain the task entrypoint, invoked when the allocator creates and runs the task.
    - `/ux` for tasks that want to display custom UX, components should be placed underneath this sub-folder.
      - `/panel.tsx` the task panel (high-level component) should always be located here.
  - `/hydra` the darknet hydra virus, works fairly differently from other scripts/tasks. (in an attempt to improve perf)
  - `/main.tsx` the script entrypoint. All in-game script interaction is marshaled through the main application started by this script.

## Hydra Structure

### V1

- Hydra is a self-replicating virus that self-propagates to neighbors. Each hydra instance is responsible for acting
  on its host, morphing into a phisher, stock pumper, or a proliferator onto other nodes.
- A central state object is maintained by the core actionator task, but we use this sparingly, mostly for controls/information
- The initial version of the hydra had literally 0 coordination between individual hydras; this led to challenges like overutilization of CPU for hacking operations, contention for logs when multiple hydras were heartbleeding() the same target, etc.

### V2

- This version of the hydra attempts to be less chaotic with the following changes:
  - Heavily utilizing IP as a unique identifier. We convert the IP to a numeral and utilize ports to directly store information against that numeral. We treat the port as a sort of 'lease'.
  - IPs only change once a server is taken offline; that is, once a server is killed. Before then, IP is a reliable identity.
  - A hydra controller will run (and remain active) on each host. This controller is minimally responsible for:
    - Opening caches / consuming stormseeds
    - Communicating its startup to a centralized controller
    - Execing other tasks at max threads (reclaim, phish, stock) and shut them down if needed
    - Proliferating to neighbors
    - Waiting to re-assess actions (either until darknet mutation, or a longer period like 6s)
  - The proliferation strategy has also changed. Instead of allowing every server to hack its neighbors, the strategy for a controller to decide to proliferate is:
    - Each hydra remembers its peers (these will obviously change on darknet mutation)
    - A hydra must establish connections to all its peers; it checks the port of that peer's IP for state. The state is one of:
      - Healthy, with listed password
      - Obsolete (port re-used for a new server), password doesn't work when tried
      - NULL PORT DATA
      - Under attack
    - If the port is healthy, we connect, scp, and exec hydra. If it's obsolete (we fail to connect), we'll claim the port by updating it to be "Under attack". Same with NULL PORT DATA, we'll claim it and attack it. If the port is under attack, we ignore it.
    - For now, nothing will clean the ports. We'll see if this leads to memory issues, but it seems less CPU intensive than communicating updates with a centralized controller and having it watch for offline status/changes. We DO still publish when a hydra spawns to an event port, so a centralized controller can decide which hydras to keep around with statics.
- A server that first discovers the labyrinth will be made static, so that we can always have a static link to the labyrinth to attack it. Static servers will be persisted by the centralized controller in a state file, and immediately connected/exec'd on launch.
