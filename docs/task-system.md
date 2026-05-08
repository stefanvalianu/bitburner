# Task system

The dashboard runs a **task manager** that decides what work the network
should be doing, hands out worker RAM, and watches every task it spawned.
Tasks are independent systems (their own scripts, their own state,
their own workers) — the manager just coordinates them.

This document describes how the manager and tasks interact. For the high-level
project overview, see the root [`README.md`](../README.md).

---

## Concepts

A **task** is a top-level intent — `"hack"`, `"scout-server"`, etc. Each task is
described once in [`scripts/lib/util/tasks/definitions.ts`](../scripts/lib/util/tasks/definitions.ts):

The manager owns the **authoritative task state** — a `Record<TaskId, TaskState>`
held in its React context. Each slot has shared base fields (`pid`, `host`,
`childPids`, `shutdownRequested`, `status`, `lastAllocation`) plus whatever
task-specific fields the definition declared. The full type lives in
[`types.ts`](../scripts/lib/util/tasks/types.ts).

The manager publishes that snapshot to `TASK_STATE_PORT` at the end of every
tick. The port is a **historical view** for tasks to read — never the source
of truth, and never read back by the manager itself.

---

## Lifecycle

Each task slot moves through three statuses:

```
        spawn                     needsRerun=true
  idle ────────► running ───────────────────────► stopping
   ▲                                                  │
   └──────────── PID dies (graceful or crash) ────────┘
```

- **idle** — not running. The manager will spawn it if `needsRerun` returns true.
- **running** — controller PID is live. If `needsRerun` returns true, the
  manager flips `shutdownRequested = true` and moves the slot to **stopping**.
  It does **not** kill the PID.
- **stopping** — the manager is waiting for the task to exit on its own. The
  task is expected to clean up its workers, persist any state via events, and
  return. When the manager next observes the PID is gone, the slot returns
  to **idle** with task-specific fields preserved.

Cooperative shutdown means the manager doesn't need to know what each task is
doing internally — in-flight HWGW batches, partial backdoors, whatever. The
task itself owns its teardown.

---

## Tick (every 10 seconds)

The manager loop in [`manager.tsx`](../scripts/lib/util/tasks/manager.tsx)
runs six steps in order:

1. **Drain events** from `TASK_EVENTS_PORT` and apply them to the in-memory
   snapshot. `state-patch` events shallow-merge into task-specific fields
   (base fields are off-limits). `child-spawned` events append worker PIDs to
   the slot's `childPids`.
2. **Reap** any slot whose `pid` is no longer running. Reset base fields to
   idle defaults; keep task-specific fields (so the next `needsRerun`
   comparison sees the most recent observed state).
3. **Evaluate `needsRerun`** for every definition.
   - `running` + rerun → flip to `stopping`, set `shutdownRequested = true`.
   - `stopping` → leave alone.
   - `idle` + rerun → mark for spawn.
   - `idle` + no rerun → leave alone.
4. **Pick spawns**. All controller-only tasks marked for spawn go through.
   Among `growUnbounded` tasks, only one runs at a time across the entire
   manager — if any growUnbounded slot is currently running or stopping, no
   new growUnbounded task spawns this tick. Otherwise the first
   growUnbounded candidate (in registration order in `definitions.ts`) wins.
5. **Place + exec**. Each chosen task gets a controller host (prefer `home`,
   fall back to the smallest non-home admin server that fits) and an
   `Allocation` from the allocator (the unbounded task gets every eligible
   server; controller-only tasks get an empty allocation). Spawn:
   `ns.exec(scriptPath, host, 1)` — no script args. The allocation lands
   in the slot's `lastAllocation` field; the task reads it through
   `BaseTask` once the snapshot is published.
6. **Publish** the snapshot to `TASK_STATE_PORT` (clear-then-write). This
   happens synchronously after every exec in the same tick, so by the time
   a freshly-spawned task gets its first cycle it can already see its own
   slot.

---

## Ports

Two ports replace all task-related communication:

| Port               | Constant        | Writer  | Reader(s) | Semantics                             |
| ------------------ | --------------- | ------- | --------- | ------------------------------------- |
| `TASK_STATE_PORT`  | manager → tasks | manager | tasks     | latest-value (clear-then-write); peek |
| `TASK_EVENTS_PORT` | tasks → manager | tasks   | manager   | FIFO; manager drains every tick       |

Tasks **never** write to `TASK_STATE_PORT`. They communicate state changes
through events; the manager applies them and re-publishes.

Each side of the wire owns its own I/O:

- The manager reads `TASK_EVENTS_PORT` and writes `TASK_STATE_PORT`. Those
  helpers (`drainEvents`, `publishSnapshot`) are private to
  [`manager.tsx`](../scripts/lib/util/tasks/manager.tsx).
- Tasks read `TASK_STATE_PORT` and write `TASK_EVENTS_PORT`. Those helpers
  (`peekTaskState`, `emitEvent`) are private to
  [`baseTask.ts`](../scripts/lib/util/tasks/baseTask.ts).

[`types.ts`](../scripts/lib/util/tasks/types.ts) holds only schemas — no
port I/O. The manager never roundtrips through the port to read state it
just wrote; its React context is the source of truth.

---

## The task-side contract

Every task script is structured the same way: declare the task id as a
constant, subclass `BaseTask`, implement `run()`, and call `start()` from
`main`.

```ts
// scripts/lib/features/scout-server.ts
import { BaseTask } from "../util/tasks/baseTask";

const TASK_ID = "scout-server"; // must match definitions.ts

class ScoutTask extends BaseTask<ScoutTaskState> {
  constructor(ns: NS) {
    super(ns, TASK_ID);
  }

  protected async run(): Promise<void> {
    // ...task logic here...
    this.patchState({ available, target });
  }
}

export async function main(ns: NS): Promise<void> {
  await new ScoutTask(ns).start();
}
```

Manager exec passes **no script args**. `BaseTask`'s `start()` first runs a
short bootstrap that polls `TASK_STATE_PORT` until the manager publishes a
snapshot where this script's PID owns the slot — that handshake guarantees
`run()` always reads its own (not a stale) allocation.

Inside `run()`, subclasses get protected accessors:

- `this.state` — our slot in the latest published snapshot (re-peeks on
  every read).
- `this.allocation` — convenience for `this.state.lastAllocation`.
- `this.snapshot` — full task-state snapshot (use for cross-task reads,
  e.g. hack reading scout's published `target`).
- `this.shouldShutdown` — true once the manager flips
  `shutdownRequested`. Equivalent to `this.state.shutdownRequested`.

And mutation helpers:

- `this.patchState(partial)` — emit a `state-patch` event for our slot.
  Base lifecycle fields are silently dropped by the manager.
- `this.exec(script, host, threads, ...args)` — wrap `ns.exec` and
  auto-emit a `child-spawned` event. Use this instead of `ns.exec`
  directly so the manager can track the worker for cleanup.
- `this.sleep(ms)` — sleep up to `ms`, returning early with `true` if
  `shouldShutdown` flips during the wait. Use this in place of
  `ns.asleep` so long-running tasks remain responsive to shutdown.
- `this.log` — pre-tagged logger (`createLogger(ns, taskId)`).

Controller-only tasks (no `growUnbounded`) get `this.allocation.servers`
as an empty array. They simply don't iterate it.

---

## Adding a task

1. Define a state interface for the task in `definitions.ts`. It must extend
   `Record<string, unknown>`.
2. Append a `TaskDefinition` entry to `TASKS`. Decide the requirements
   (today: only `growUnbounded`), an `initialState`, and a `needsRerun`
   function.
3. Write the entrypoint script under `scripts/lib/features/`:
   - Declare `const TASK_ID = "..."` at the top — must match the id in
     `definitions.ts`.
   - Subclass `BaseTask<YourTaskState>`, implement `run()`, call
     `super(ns, TASK_ID)` in the constructor.
   - In `main(ns)`, instantiate and call `start()`.

That's it. The manager will pick up the new entry on the next tick and run it
when `needsRerun` first returns true.

---

## Why cooperative shutdown

Tasks know what they're doing. The manager doesn't (and shouldn't). Tasks may
have:

- Workers mid-batch (HWGW timing matters; killing a hack mid-flight wastes
  prep work).
- Persistent state to flush before exit.
- A teardown sequence specific to their domain.

The manager flips a flag and waits. Tasks that ignore the flag run forever —
the manager trusts task authors to honor it. The dashboard's **Kill all**
button is the explicit override: it hard-kills every tracked controller and
worker without waiting.
