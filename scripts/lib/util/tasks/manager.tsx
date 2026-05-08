import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NS } from "@ns";
import { useGameState } from "../gameState";
import { useLogger } from "../logging/log";
import { useNs } from "../ns";
import { TASK_EVENTS_PORT, TASK_STATE_PORT } from "../ports";
import type { ServerInfo } from "../serverMap";
import { allocate } from "./allocator";
import { TASKS } from "./definitions";
import {
  BASE_STATE_KEYS,
  type Allocation,
  type BaseTaskState,
  type TaskDefinition,
  type TaskEvent,
  type TaskId,
  type TaskState,
  type TaskStateSnapshot,
} from "./types";

// ---------------------------------------------------------------------------
// Port I/O — the manager owns *both* directions of the wire.
//
//   • TASK_STATE_PORT: write-only side. The manager publishes its
//     authoritative in-memory snapshot here at the end of every tick.
//     Tasks peek; the manager itself never reads back.
//   • TASK_EVENTS_PORT: read-only side. Tasks emit events here; the
//     manager drains and applies them at the start of every tick.
//
// The manager's React context is the source of truth for task state.
// ---------------------------------------------------------------------------

function publishSnapshot(ns: NS, snapshot: TaskStateSnapshot): void {
  ns.clearPort(TASK_STATE_PORT);
  ns.writePort(TASK_STATE_PORT, JSON.stringify(snapshot));
}

function drainEvents(ns: NS): TaskEvent[] {
  const port = ns.getPortHandle(TASK_EVENTS_PORT);
  const out: TaskEvent[] = [];
  while (!port.empty()) {
    const raw = port.read();
    if (typeof raw !== "string") continue;
    try {
      const parsed = JSON.parse(raw) as TaskEvent;
      if (parsed && typeof parsed === "object" && "type" in parsed) out.push(parsed);
    } catch {
      // ignore malformed payloads
    }
  }
  return out;
}

// Home runs the dashboard and is preferred for controllers, but stays out
// of the worker pool so worker RAM and controller RAM don't compete.
const EXCLUDE_WORKERS_FROM = new Set(["home"]);

function makeInitialSnapshot(): TaskStateSnapshot {
  const snap: TaskStateSnapshot = {};
  for (const def of TASKS) {
    snap[def.id] = {
      ...({
        pid: null,
        host: null,
        childPids: [],
        shutdownRequested: false,
        status: "idle",
        lastAllocation: null,
      } as BaseTaskState),
      ...(def.initialState as Record<string, unknown>),
    } as TaskState;
  }
  return snap;
}

// Reset base lifecycle fields to "idle" while keeping task-specific fields
// intact. We deliberately preserve task fields across stops/crashes so the
// next evaluate comparison has the most recent observed state to work with
// (e.g. scout's `available` list).
function resetSlotToIdle(slot: TaskState): TaskState {
  return {
    ...slot,
    pid: null,
    host: null,
    childPids: [],
    shutdownRequested: false,
    status: "idle",
    lastAllocation: null,
  };
}

// Pick a host for a controller. Prefers home; falls back to the smallest
// non-home admin server that fits.
function pickControllerHost(
  ns: NS,
  servers: ServerInfo[],
  ramNeeded: number,
  ourHomeFootprint: number,
  reserved: Set<string>,
): string | null {
  const homeFree = ns.getServerMaxRam("home") - ns.getServerUsedRam("home") + ourHomeFootprint;
  if (homeFree >= ramNeeded) return "home";

  const candidates = servers
    .filter(
      (s) =>
        s.hostname !== "home" &&
        s.hasAdminRights &&
        !reserved.has(s.hostname) &&
        s.maxRam >= ramNeeded,
    )
    .sort((a, b) => a.maxRam - b.maxRam);
  return candidates[0]?.hostname ?? null;
}

export interface TaskManagerApi {
  taskState: TaskStateSnapshot;
  lastTickAt: number | null;
}

const TaskManagerContext = createContext<TaskManagerApi | null>(null);

export function TaskManagerProvider({ children }: { children: ReactNode }) {
  const ns = useNs();
  const log = useLogger("manager");
  const game = useGameState();
  const [taskState, setTaskState] = useState<TaskStateSnapshot>(() => makeInitialSnapshot());
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);

  // taskState is read at the top of each tick to build the next snapshot.
  // Held in a ref so the tick effect doesn't have to depend on (and re-run
  // for) its own setState — the tick is driven exclusively by gameState.tick.
  const stateRef = useRef<TaskStateSnapshot>(taskState);
  stateRef.current = taskState;

  useEffect(() => {
    const runTick = () => {
      // Mutable working copy. Slot objects are also cloned where mutated to
      // avoid sharing references with the previous snapshot.
      const snap: TaskStateSnapshot = {};
      for (const [id, slot] of Object.entries(stateRef.current)) {
        snap[id] = { ...slot, childPids: [...slot.childPids] };
      }

      // -------------------------------------------------------------------
      // 1. Drain events from tasks and apply them to the snapshot.
      // -------------------------------------------------------------------
      const events = drainEvents(ns);
      for (const ev of events) {
        const slot = snap[ev.taskId];
        if (!slot) continue;
        if (ev.type === "child-spawned") {
          if (!slot.childPids.includes(ev.pid)) slot.childPids.push(ev.pid);
          continue;
        } else if (ev.type === "task-finished") {
          slot.status = "finished";
          continue;
        } else if (ev.type === "state-patch") {
          for (const [k, v] of Object.entries(ev.patch)) {
            if (BASE_STATE_KEYS.has(k)) continue; // reject manager-owned fields
            slot[k] = v;
          }
        }
      }

      // -------------------------------------------------------------------
      // 2. Reap any slot whose PID is gone — manual kill, exec failure,
      //    voluntary exit, or graceful shutdown after seeing the flag.
      // -------------------------------------------------------------------
      for (const [id, slot] of Object.entries(snap)) {
        if (slot.pid !== null && !ns.isRunning(slot.pid)) {
          if (slot.status === "stopping" || slot.status === "finished") {
            log.info(`task ${id} completed`);
          } else if (slot.status === "running") {
            log.warn(`task ${id} died unexpectedly (pid=${slot.pid})`);
          }
          snap[id] = resetSlotToIdle(slot);
        }
      }

      // -------------------------------------------------------------------
      // 3. Evaluate each definition. Build the spawn list AND apply
      //    shutdown flags as needed.
      //
      //    evaluate receives the live in-memory snapshot directly — the
      //    manager owns the authoritative state, so we don't roundtrip
      //    through the port to read it back.
      // -------------------------------------------------------------------
      const spawnCandidates: TaskDefinition[] = [];
      for (const def of TASKS) {
        const slot = snap[def.id];
        const decision = def.evaluate(game, slot, snap);
        if (slot.status === "stopping") continue; // already winding down
        if (slot.status === "running") {
          if (decision === "restart" || decision === "shutdown") {
            slot.shutdownRequested = true;
            slot.status = "stopping";
            log.info(`task ${def.id} requested shutdown — decision=${decision}`);
          }
          continue;
        }

        if (decision === "restart") spawnCandidates.push(def);
      }

      // -------------------------------------------------------------------
      // 4. Apply the "one unbounded task at a time" policy. If any
      //    growUnbounded slot is currently running or stopping, no
      //    growUnbounded task spawns this tick. Otherwise pick the first
      //    growUnbounded candidate (registration order is the priority).
      // -------------------------------------------------------------------
      const unboundedActive = TASKS.some(
        (def) =>
          def.requirements.growUnbounded === true &&
          (snap[def.id].status === "running" || snap[def.id].status === "stopping"),
      );
      const finalSpawns: TaskDefinition[] = [];
      let chosenUnbounded: TaskDefinition | null = null;
      for (const def of spawnCandidates) {
        if (def.requirements.growUnbounded === true) {
          if (unboundedActive) continue; // a different unbounded slot owns the fleet
          if (chosenUnbounded) continue; // already picked one this tick
          chosenUnbounded = def;
          finalSpawns.push(def);
        } else {
          finalSpawns.push(def);
        }
      }

      // -------------------------------------------------------------------
      // 5. Place + spawn each chosen task. Allocation goes through
      //    allocator.allocate; controller-only tasks get empty allocations.
      // -------------------------------------------------------------------
      const placements = new Map<TaskId, { host: string; ram: number }>();
      const reserved = new Set<string>();
      // Account for our own controllers already on home (so the free-RAM
      // probe doesn't fight with sibling controllers we're respawning).
      const ourHomeFootprint = Object.values(snap)
        .filter((s) => s.host === "home" && s.pid !== null)
        .reduce((sum) => sum + 0, 0); // controllers being spawned here are net-new

      for (const def of finalSpawns) {
        const ram = ns.getScriptRam(def.scriptPath);
        if (ram === 0) {
          log.error(`script not found: ${def.scriptPath}`);
          continue;
        }
        const host = pickControllerHost(ns, game.servers, ram, ourHomeFootprint, reserved);
        if (!host) {
          log.warn(`no host fits ${def.id} controller (${ram}GB)`);
          continue;
        }
        placements.set(def.id, { host, ram });
        if (host !== "home") reserved.add(host);
      }

      const exclude = new Set([...EXCLUDE_WORKERS_FROM, ...reserved]);
      const controllerOnlyIds = finalSpawns
        .filter((d) => d.requirements.growUnbounded !== true)
        .map((d) => d.id);
      const allocations = allocate(game.servers, chosenUnbounded?.id ?? null, controllerOnlyIds, {
        exclude,
      });

      for (const def of finalSpawns) {
        const place = placements.get(def.id);
        if (!place) continue;
        const allocation: Allocation = allocations.get(def.id) ?? {
          taskId: def.id,
          servers: [],
        };
        if (def.requirements.growUnbounded === true && allocation.servers.length === 0) {
          log.info(`skip ${def.id}: requested all RAM but no worker servers available`);
          continue;
        }
        // No script args — the task reads its own slot (incl. allocation)
        // from the published TASK_STATE_PORT snapshot via BaseTask. Each
        // task script declares its own taskId as a constant.
        const pid = ns.exec(def.scriptPath, place.host, 1);
        if (pid === 0) {
          log.warn(`failed to exec ${def.scriptPath} on ${place.host}`);
          continue;
        }
        const totalRam = allocation.servers.reduce((sum, s) => sum + s.ram, 0);
        log.info(
          `${def.id} on ${place.host} → ${allocation.servers.length} hosts (${totalRam}GB) pid=${pid}`,
        );
        // Update slot in-place. Task-specific fields are preserved; base
        // fields are reset for the new run.
        snap[def.id] = {
          ...snap[def.id],
          pid,
          host: place.host,
          childPids: [],
          shutdownRequested: false,
          status: "running",
          lastAllocation: allocation,
        };
      }

      // -------------------------------------------------------------------
      // 6. Publish the snapshot to TASK_STATE_PORT (latest-value).
      // -------------------------------------------------------------------
      publishSnapshot(ns, snap);

      stateRef.current = snap;
      setTaskState(snap);
      setLastTickAt(Date.now());
    };

    runTick();
  }, [game.tick, ns, log]);

  const api = useMemo<TaskManagerApi>(
    () => ({
      taskState,
      lastTickAt,
    }),
    [taskState, lastTickAt],
  );

  return <TaskManagerContext.Provider value={api}>{children}</TaskManagerContext.Provider>;
}

export function useTaskManager(): TaskManagerApi {
  const v = useContext(TaskManagerContext);
  if (!v) throw new Error("useTaskManager must be used inside <TaskManagerProvider>");
  return v;
}
