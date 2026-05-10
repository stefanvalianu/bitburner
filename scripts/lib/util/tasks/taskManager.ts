import { NS } from "@ns";
import {
  BASE_STATE_KEYS,
  ServerSlice,
  TaskDefinition,
  TaskDemand,
  TaskEvent,
  TaskId,
  TaskState,
} from "./types";
import { DashboardState } from "../dashboardTypes";
import { Logger } from "../logging/log";
import { TASK_EVENTS_PORT } from "../ports";
import { ALL_TASKS } from "./definitions/tasks";
import { allocateAllTasks } from "./allocator";

const TASK_BY_ID: ReadonlyMap<TaskId, TaskDefinition> = new Map(ALL_TASKS.map((t) => [t.id, t]));

// RAM held back from the allocator on `home` for the dashboard process and
// any ad-hoc scripts the player launches outside the task manager. The pool
// is built from `maxRam`, not actual free RAM, so without this buffer tasks
// would oversubscribe `home` and fail to exec.
export const HOME_RESERVED_RAM_GB = 8;

// Minimum fraction of total RAM that must be unallotted before the dashboard
// offers a "Reallocate" action. Below this slack, redistribution can't move
// a meaningful amount of RAM to a starved task.
const REALLOCATE_SLACK_FRACTION = 0.1;

export class TaskManager {
  private readonly ns: NS;
  private readonly logger: Logger;

  private state?: DashboardState | undefined;

  constructor(ns: NS, logger: Logger) {
    this.ns = ns;
    this.logger = logger;
  }

  // Triggers the manual creation of one or more task(s) to be placed/ran
  begin(taskIds: TaskId[]): Record<TaskId, TaskState> | undefined {
    const next: Record<TaskId, TaskState> = {
      ...this.state!.tasks,
    };

    let addedAny = false;

    for (const taskId of taskIds) {
      const slot = next[taskId];

      if (slot) {
        this.logger.warn(
          `Attempting to start task ${taskId} but it's already running or already requested. Ignoring`,
        );
        continue;
      }

      next[taskId] = {
        allocation: null,
        childPids: [],
        pid: null,
        host: null,
        shutdownRequested: false,
        status: "requested",
      };

      this.logger.info(`task ${taskId} start requested`);
      addedAny = true;
    }

    return addedAny ? next : undefined;
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

    // 1. Drain events from tasks and apply them to the snapshot.
    const events = this.drainEvents();
    for (const ev of events) {
      const slot = snap[ev.taskId];
      if (!slot) continue;
      if (ev.type === "child-spawned") {
        if (!slot.childPids.includes(ev.pid)) slot.childPids.push(ev.pid);
      } else if (ev.type === "state-patch") {
        for (const [k, v] of Object.entries(ev.patch)) {
          if (BASE_STATE_KEYS.has(k)) continue; // manager-owned
          (slot as Record<string, unknown>)[k] = v;
        }
      }
    }

    // 2. Reap any slot whose PID is gone — manual kill, exec failure,
    //    voluntary exit, or graceful shutdown after seeing the flag.
    for (const [id, slot] of Object.entries(snap)) {
      if (slot.pid !== null && !this.ns.isRunning(slot.pid)) {
        if (slot.status === "stopping") {
          this.logger.info(`task ${id} completed`);
        } else if (slot.status === "running") {
          this.logger.warn(`task ${id} died unexpectedly (pid=${slot.pid})`);
        }

        delete snap[id];
      }
    }

    // 3. Identify pending demands — autostart tasks not currently running.
    //    Resolve entrypointRam for each via ns.getScriptRam.
    const pending = new Map<TaskId, TaskDemand>();
    // first, run our autostarting tasks (They are important!)
    for (const def of ALL_TASKS) {
      if (!def.autostart) continue;

      // Skip if already running/stopping — would otherwise double-consume
      // RAM when allocateAllTasks reserves the slot from `running` and then
      // allocates it again from `pending`.
      const slot = snap[def.id];
      if (slot && (slot.status === "running" || slot.status === "stopping")) continue;

      const path = getTaskScriptPath(def);
      // ns.getScriptRam returns 0.05GB-aligned floats (e.g. 2.4) — round up so
      // every value entering the allocator is an integer GB and reservations
      // can never accumulate fractional drift across hosts.
      const entrypointRam = Math.ceil(this.ns.getScriptRam(path));
      if (entrypointRam === 0) {
        this.logger.error(`script not found: ${path}`);
        continue;
      }
      pending.set(def.id, { ...def.demand, entrypointRam });
    }

    // then add our user-requested tasks
    for (const [id, slot] of Object.entries(snap)) {
      if (slot.status !== "requested") continue;
      const def = ALL_TASKS.find((t) => t.id === id);
      if (!def) {
        this.logger.error(`cannot find task definition for ${id}`);
        continue;
      }
      const path = getTaskScriptPath(def);
      const entrypointRam = Math.ceil(this.ns.getScriptRam(path));
      if (entrypointRam === 0) {
        this.logger.error(`script not found: ${path}`);
        continue;
      }
      pending.set(id, { ...def.demand, entrypointRam });
    }

    // 4. Build the pool from owned, accessible, non-excluded servers.
    const pool: ServerSlice[] = state.allServers
      .filter((s) => s.hasAdminRights && s.maxRam > 0)
      .map((s) => {
        const reserved = s.hostname === "home" ? HOME_RESERVED_RAM_GB : 0;
        return {
          hostname: s.hostname,
          ram: Math.max(0, s.maxRam - reserved),
          cores: s.cpuCores,
        };
      });

    // 5. Lock RAM held by tasks already running (or winding down).
    const running = new Map<TaskId, ServerSlice[]>();
    for (const [id, slot] of Object.entries(snap)) {
      if ((slot.status === "running" || slot.status === "stopping") && slot.allocation) {
        running.set(id, slot.allocation.servers);
      }
    }

    // 6. Run the priority pipeline.
    const allocations = allocateAllTasks(pool, running, pending);

    // 7. Spawn each pending task on its allocation.
    for (const [id, slices] of allocations) {
      if (running.has(id)) continue; // already running, allocation preserved
      const def = TASK_BY_ID.get(id);
      const demand = pending.get(id);
      if (!def || !demand) continue;

      if (slices.length === 0) {
        if (demand.priority === "critical") {
          this.logger.warn(`critical task ${id} could not be placed`);
        }
        continue;
      }

      // Pick the slice with the most RAM that fits the controller.
      const controller = slices
        .filter((s) => s.ram >= demand.entrypointRam)
        .sort((a, b) => b.ram - a.ram)[0];
      if (!controller) {
        this.logger.warn(`task ${id} allocated but no slice fits entrypoint`);
        continue;
      }

      const path = getTaskScriptPath(def);
      const pid = this.ns.exec(path, controller.hostname, 1);
      if (pid === 0) {
        this.logger.warn(`failed to exec ${path} on ${controller.hostname}`);
        continue;
      }

      const totalRam = slices.reduce((sum, s) => sum + s.ram, 0);
      this.logger.info(
        `${id} on ${controller.hostname} → ${slices.length} hosts (${this.ns.format.ram(totalRam)}) pid=${pid}`,
      );

      snap[id] = {
        ...snap[id],
        pid,
        host: controller.hostname,
        childPids: [],
        shutdownRequested: false,
        status: "running",
        allocation: { taskId: id, servers: slices },
      } as TaskState;
    }

    // 8. Auto-trigger reallocation when a requested task couldn't be placed
    //    AND there's an unbounded task running whose RAM might be reclaimable.
    let unplaced = false;
    for (const [id, slices] of allocations) {
      if (running.has(id)) continue;
      if (slices.length === 0) {
        unplaced = true;
        break;
      }
    }
    if (unplaced) {
      let hasRunningUnbounded = false;
      for (const id of running.keys()) {
        if (snap[id]?.status !== "running") continue; // skip stopping/shutdown-requested
        if (TASK_BY_ID.get(id)?.demand.unbounded) {
          hasRunningUnbounded = true;
          break;
        }
      }
      if (hasRunningUnbounded) this.reallocate();
    }

    return snap;
  }

  shouldShowReallocate(state: DashboardState): boolean {
    let total = 0;
    for (const s of state.allServers) {
      if (!s.hasAdminRights || s.maxRam <= 0) continue;
      const reserved = s.hostname === "home" ? HOME_RESERVED_RAM_GB : 0;
      total += Math.max(0, s.maxRam - reserved);
    }
    if (total <= 0) return false;

    let allotted = 0;
    for (const slot of Object.values(state.tasks)) {
      if (!slot.allocation) continue;
      for (const slice of slot.allocation.servers) allotted += slice.ram;
    }
    if ((total - allotted) / total < REALLOCATE_SLACK_FRACTION) return false;

    for (const [id, slot] of Object.entries(state.tasks)) {
      const def = TASK_BY_ID.get(id);
      if (!def?.demand.unbounded) continue;
      const allocRam = slot.allocation?.servers.reduce((sum, x) => sum + x.ram, 0) ?? 0;
      if (def.demand.maxRamDemand == null) return true;
      if (allocRam < def.demand.maxRamDemand) return true;
    }
    return false;
  }

  reallocate(): void {
    this.logger.info("Task reallocation beginning.");
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
}

export function getTaskScriptPath(task: TaskDefinition): string {
  return `lib/util/tasks/definitions/${task.id}/task.js`;
}
