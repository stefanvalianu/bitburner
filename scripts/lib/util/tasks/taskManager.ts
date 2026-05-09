import { NS } from "@ns";
import { BASE_STATE_KEYS, TaskDefinition, TaskEvent, TaskId, TaskState } from "./types";
import { DashboardState } from "../dashboardTypes";
import { Logger } from "../logging/log";
import { TASK_EVENTS_PORT } from "../ports";
import { ALL_TASKS } from "./definitions/tasks";

export class TaskManager {
  private readonly ns: NS;
  private readonly logger: Logger;

  private state?: DashboardState | undefined;

  constructor(ns: NS, logger: Logger) {
    this.ns = ns;
    this.logger = logger;
  }

  // Attempts to gracefully shutdown a given taskId
  shutdown(taskId: TaskId): Record<TaskId, TaskState> | undefined {
    const slot = this.state?.tasks[taskId];
    if (!slot) return undefined;
    if (slot.status !== "running") return undefined;

    const next: Record<TaskId, TaskState> = {
      ...this.state!.tasks,
      [taskId]: { ...slot, shutdownRequested: true, status: "stopping" },
    };

    this.logger.info(`task ${taskId} shutdown requested`);
    return next;
  }

  runTick(state: DashboardState): Record<TaskId, TaskState> {
    this.state = state;

    // Mutable working copy. Slot objects are also cloned where mutated to
    // avoid sharing references with the previous snapshot.
    const snap: Record<TaskId, TaskState> = {};
    for (const [id, slot] of Object.entries(state.tasks)) {
      snap[id] = { ...slot, childPids: [...slot.childPids] };
    }

    // -------------------------------------------------------------------
    // 1. Drain events from tasks and apply them to the snapshot.
    // -------------------------------------------------------------------
    const events = this.drainEvents();
    for (const ev of events) {
      const slot = snap[ev.taskId];
      if (!slot) continue;
      if (ev.type === "child-spawned") {
        if (!slot.childPids.includes(ev.pid)) slot.childPids.push(ev.pid);
        continue;
      } else if (ev.type === "state-patch") {
        for (const [k, v] of Object.entries(ev.patch)) {
          if (BASE_STATE_KEYS.has(k)) continue; // only the manager can update these fields
          slot[k] = v;
        }
      }
    }

    // -------------------------------------------------------------------
    // 2. Reap any slot whose PID is gone — manual kill, exec failure,
    //    voluntary exit, or graceful shutdown after seeing the flag.
    // -------------------------------------------------------------------
    for (const [id, slot] of Object.entries(snap)) {
      if (slot.pid !== null && !this.ns.isRunning(slot.pid)) {
        if (slot.status === "stopping") {
          this.logger.info(`task ${id} completed`);
        } else if (slot.status === "running") {
          this.logger.warn(`task ${id} died unexpectedly (pid=${slot.pid})`);
        }

        delete snap.tasks[id];
      }
    }

    // -------------------------------------------------------------------
    // 3. Identify candidates of tasks that should be running ()
    // -------------------------------------------------------------------
    const spawnCandidates: TaskDefinition[] = [];
    for (const def of ALL_TASKS) {
      const slot = snap.tasks[def.id];


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
    // 4. Place + spawn each chosen task. Allocation goes through
    //    allocator.allocate; controller-only tasks get empty allocations.
    // -------------------------------------------------------------------
    /*
    const placements = new Map<TaskId, { host: string; ram: number }>();
    const reserved = new Set<string>();
    // Account for our own controllers already on home (so the free-RAM
    // probe doesn't fight with sibling controllers we're respawning).
    const ourHomeFootprint = Object.values(snap.tasks)
      .filter((s) => s.host === "home" && s.pid !== null)
      .reduce((sum) => sum + 0, 0); // controllers being spawned here are net-new

    for (const def of finalSpawns) {
      const ram = ns.getScriptRam(getTaskScriptPath(def));
      if (ram === 0) {
        log.error(`script not found: ${getTaskScriptPath(def)}`);
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
      const pid = ns.exec(getTaskScriptPath(def), place.host, 1);
      if (pid === 0) {
        log.warn(`failed to exec ${getTaskScriptPath(def)} on ${place.host}`);
        continue;
      }
      const totalRam = allocation.servers.reduce((sum, s) => sum + s.ram, 0);
      log.info(
        `${def.id} on ${place.host} → ${allocation.servers.length} hosts (${totalRam}GB) pid=${pid}`,
      );
      // Update slot in-place. Task-specific fields are preserved; base
      // fields are reset for the new run.
      snap.tasks[def.id] = {
        ...snap.tasks[def.id],
        pid,
        host: place.host,
        childPids: [],
        shutdownRequested: false,
        status: "running",
        lastAllocation: allocation,
      };
    }*/

    return snap;
  }

  private drainEvents(): TaskEvent[] {
    const port = this.ns.getPortHandle(TASK_EVENTS_PORT);
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

  private getTaskScriptPath(task: TaskDefinition) {
    return `lib/util/tasks/definitions/${task.id}/task.js`;
  }
}

/*

// Home runs the dashboard and is preferred for controllers, but stays out
// of the worker pool so worker RAM and controller RAM don't compete.
const EXCLUDE_WORKERS_FROM = new Set(["home"]);

function makeInitialSnapshot(): TaskStateSnapshot {
  const snap: TaskStateSnapshot = { gameState: null, tasks: {} };
  for (const def of TASKS) {
    snap.tasks[def.id] = {
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
  */
