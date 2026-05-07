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

```ts
{
  id: "hack",
  scriptPath: "lib/features/hack-controller-v1.js",
  requirements: { growUnbounded: true },
  initialState: { target: null },
  needsRerun: (game, state) => /* should this task be running fresh? */,
}
```

The manager owns the **authoritative task state** — a `Record<TaskId, TaskState>`.
Each slot has shared base fields (`pid`, `host`, `childPids`, `shutdownRequested`,
`status`, `lastAllocation`) plus whatever task-specific fields the definition
declared. The full type lives in [`types.ts`](../scripts/lib/util/tasks/types.ts).

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
   `ns.exec(scriptPath, host, 1, taskId, allocationJson)`.
6. **Publish** the snapshot to `TASK_STATE_PORT` (clear-then-write).

---

## Ports

Two ports replace all task-related communication:

| Port               | Constant        | Writer  | Reader(s) | Semantics                             |
| ------------------ | --------------- | ------- | --------- | ------------------------------------- |
| `TASK_STATE_PORT`  | manager → tasks | manager | tasks     | latest-value (clear-then-write); peek |
| `TASK_EVENTS_PORT` | tasks → manager | tasks   | manager   | FIFO; manager drains every tick       |

Tasks **never** write to `TASK_STATE_PORT`. They communicate state changes
through events; the manager applies them and re-publishes.

The port-side helpers (`writeTaskState`, `peekTaskState`, `emitEvent`,
`drainEvents`) live in [`types.ts`](../scripts/lib/util/tasks/types.ts).
Task scripts use the higher-level wrappers in
[`client.ts`](../scripts/lib/util/tasks/client.ts).

---

## The task-side contract

A task entrypoint is invoked as
`ns.exec(scriptPath, host, 1, taskId, allocationJson)`. It must:

1. **Read its identity and allocation** with `readTaskId(ns)` and
   `readAllocation(ns)` from `tasks/client.ts`.
2. **Patch its slot** with task-specific state via `patchState(ns, taskId, ...)`.
   Common practice: emit a startup patch recording the parameters the run was
   started against (e.g. hack records its `target`), so `needsRerun` can detect
   when those parameters drift.
3. **Report every spawned worker** with `reportChild(ns, taskId, pid, host)`.
   The manager uses these for its own tracking; tasks also see them in their
   own slot's `childPids` on subsequent peeks.
4. **Poll for shutdown** with `isShutdownRequested(ns, taskId)` on a short
   interval (~2s). When it flips, kill any workers still running and
   return cleanly.

Controller-only tasks (no `growUnbounded`) still receive an `Allocation` arg —
just an empty one. They can read and ignore it.

---

## Adding a task

1. Define a state interface for the task in `definitions.ts`. It must extend
   `Record<string, unknown>`.
2. Append a `TaskDefinition` entry to `TASKS`. Decide the requirements
   (today: only `growUnbounded`), an `initialState`, and a `needsRerun`
   function.
3. Write the entrypoint script under `scripts/lib/features/`. Follow the
   read → patch → spawn-and-report → poll-shutdown contract above.

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
