import { NS } from "@ns";
import {
  ServerSlice,
  TaskDemand,
  TaskEvent,
  TaskId,
  TaskManagerState,
  TaskState,
} from "@repo/common/tasks/types";
import { drainPortData, TASK_EVENTS_PORT, TASK_STATE_PORT } from "@repo/common/ports";
import { allocateAllTasks } from "@repo/common/tasks/allocator";
import { Logger } from "@repo/common/logger";
import { ALL_TASKS, TASK_BY_ID } from "@repo/tasks";
import { getTaskScriptPath } from "@repo/common/tasks/helpers";
import { crawlServers } from "@repo/common/crawlServers";
import { DashboardState } from "../app/DashboardProvider";
import { MutableRefObject } from "react";

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
  private readonly gameState: MutableRefObject<DashboardState>;

  private taskState: TaskManagerState;

  // True while a reallocation cycle is in progress: unbounded tasks have been
  // asked to shut down so their RAM can be returned to the pool, and we're
  // waiting for them to die before re-requesting them. begin/shutdown/manual
  // reallocate are all refused while this is set.
  private reallocating: boolean = false;
  // Task ids that were shut down for reallocation and need to be re-requested
  // once they've all actually terminated.
  private restartIds: Set<TaskId> = new Set();

  constructor(ns: NS, gameState: MutableRefObject<DashboardState>,logger: Logger) {
    this.ns = ns;
    this.logger = logger;
    this.taskState = { tasks: new Map() } ;
    this.gameState = gameState;
  }

  isReallocating(): boolean {
    return this.reallocating;
  }

  // Triggers the manual creation of one or more task(s) to be placed/ran
  begin(taskIds: TaskId[]): void {
    if (this.reallocating) {
      this.logger.warn("Cannot start tasks while reallocation is in progress");
      return;
    }

    for (const taskId of taskIds) {
      const slot = this.taskState.tasks.get(taskId);

      if (slot) {
        this.logger.warn(
          `Attempting to start task ${taskId} but it's already running or already requested. Ignoring`,
        );
        continue;
      }

      const def = TASK_BY_ID.get(taskId);
      if (
        def?.checkRequirements &&
        (this.gameState === undefined || def.checkRequirements(this.ns) !== undefined)
      ) {
        this.logger.error(
          `Attempting to start task ${taskId} but its requirements are unmet. Should be blocked in UX, ignoring.`,
        );
        continue;
      }

      this.taskState.tasks.set(taskId, {
        id: taskId,
        allocation: null,
        pid: null,
        host: null,
        shutdownRequested: false,
        status: "requested",
      });

      this.logger.info(`task ${taskId} start requested`);
    }
  }

  // Attempts to gracefully shutdown a given taskId
  shutdown(taskId: TaskId): void {
    if (this.reallocating) {
      this.logger.warn(`Cannot shutdown ${taskId} while reallocation is in progress`);
      return;
    }

    const slot = this.taskState.tasks.get(taskId);
    if (!slot) return;
    if (slot.status !== "running") return;

    slot.shutdownRequested = true;
    slot.status = "stopping";

    this.logger.info(`task ${taskId} shutdown requested`);
  }

  runTick(): void {
    /*
      1. Drain events from tasks and apply them to the snapshot.
    */
    const events = drainPortData<TaskEvent>(this.ns, TASK_EVENTS_PORT) ?? [];
    for (const event of events) {
      const slot = this.taskState.tasks.get(event.taskId);
      if (!slot) continue;

      if (event.type === "shutdown") {
        if (slot.status === "running") {
          slot.status = "stopping";
        }
      }
    }

    /*
      2. Reap any slot whose PID is gone: manual kill, exec failure,
      voluntary exit, or graceful shutdown after seeing the flag.
    */
    for (const task of this.taskState.tasks.values()) {
      if (task.pid !== null && !this.ns.isRunning(task.pid)) {
        if (task.status === "stopping") {
          this.logger.info(`task ${task.id} completed`);
        } else if (task.status === "running") {
          this.logger.warn(`task ${task.id} died unexpectedly (pid=${task.pid})`);
        }

        this.taskState.tasks.delete(task.id);
      }
    }

    /*
      3 Reallocation finalize: once every task we asked to shut down has
      actually terminated, re-add them as `requested` so the allocator
      places them fresh, and exit the reallocating phase.
    */
    if (this.reallocating && this.restartIds.size > 0) {
      let anyAlive = false;
      for (const id of this.restartIds) {
        if (this.taskState.tasks.has(id)) {
          anyAlive = true;
          break;
        }
      }

      if (!anyAlive) {
        for (const id of this.restartIds) {
          this.taskState.tasks.set(id, {
            id: id,
            allocation: null,
            pid: null,
            host: null,
            shutdownRequested: false,
            status: "requested",
          });
        }

        this.logger.info(`reallocate: ${this.restartIds.size} task(s) terminated, re-requesting`);
        this.restartIds.clear();
        this.reallocating = false;
      }
    }

    /*
      3. Identify pending demands: autostart tasks not currently running.
      Resolve entrypointRam for each via ns.getScriptRam.
    */
    const pending = new Map<TaskId, TaskDemand>();
    // first, run our autostarting tasks (They are important!)
    for (const def of ALL_TASKS) {
      if (!def.autostart) continue;

      // Skip if already running/stopping; would otherwise double-consume
      // RAM when allocateAllTasks reserves the slot from `running` and then
      // allocates it again from `pending`.
      const slot = this.taskState.tasks.get(def.id);
      if (slot && (slot.status === "running" || slot.status === "stopping")) continue;

      const path = getTaskScriptPath(def);

      // ns.getScriptRam returns 0.05GB-aligned floats (e.g. 2.4); round up so
      // every value entering the allocator is an integer GB and reservations
      // can never accumulate fractional drift across hosts.
      let entrypointRam = Math.ceil(this.ns.getScriptRam(path));
      if (entrypointRam === 0) {
        this.logger.error(`script not found: ${path}`);
        continue;
      }
      if (def.demand.additionalHeadroomSubscripts && def.demand.additionalHeadroomSubscripts.length > 0) {
        let additionalScriptMax = 0;
        for (const subscript of def.demand.additionalHeadroomSubscripts) {
          additionalScriptMax = Math.max(additionalScriptMax, this.ns.getScriptRam(subscript));
        }
        entrypointRam += additionalScriptMax;
      }
      pending.set(def.id, { ...def.demand, entrypointRam });
    }

    // then add our user-requested tasks
    for (const task of this.taskState.tasks.values()) {
      if (task.status !== "requested") continue;
      const def = ALL_TASKS.find((t) => t.id === task.id);
      if (!def) {
        this.logger.error(`cannot find task definition for ${task.id}`);
        continue;
      }
      const path = getTaskScriptPath(def);
      let entrypointRam = Math.ceil(this.ns.getScriptRam(path));
      if (entrypointRam === 0) {
        this.logger.error(`script not found: ${path}`);
        continue;
      }
      if (def.demand.additionalHeadroomSubscripts && def.demand.additionalHeadroomSubscripts.length > 0) {
        let additionalScriptMax = 0;
        for (const subscript of def.demand.additionalHeadroomSubscripts) {
          additionalScriptMax = Math.max(additionalScriptMax, this.ns.getScriptRam(subscript));
        }
        entrypointRam += additionalScriptMax;
      }
      pending.set(task.id, { ...def.demand, entrypointRam });
    }

    /*
      4. Build the pool from owned, accessible, non-excluded servers.
      Use game state info if possible (less operations), but if that's
      not available let's do a live crawl of all servers.
    */
    const pool: ServerSlice[] = ((this.gameState.current.servers.length ?? 0) > 0) ? 
      this.gameState.current.servers
        .filter((s) => s.hasAdminRights && s.maxRam > 0)
        .map((s) => {
          const reserved = s.hostname === "home" ? HOME_RESERVED_RAM_GB : 0;
          return {
            hostname: s.hostname,
            ram: Math.max(0, s.maxRam - reserved),
            cores: s.cpuCores,
          } satisfies ServerSlice;
        }) :
      crawlServers(this.ns)
        .filter((s) => s.hasAdminRights && s.maxRam > 0)
        .map((s) => {
          const reserved = s.hostname === "home" ? HOME_RESERVED_RAM_GB : 0;
          return {
            hostname: s.hostname,
            ram: Math.max(0, s.maxRam - reserved),
            cores: s.cpuCores,
          } satisfies ServerSlice;
        });

    /*
      Lock RAM held by tasks already running (or winding down).
    */
    const running = new Map<TaskId, ServerSlice[]>();
    for (const task of this.taskState.tasks.values()) {
      if ((task.status === "running" || task.status === "stopping") && task.allocation) {
        running.set(task.id, task.allocation.servers);
      }
    }

    /*
      6. Run the priority pipeline.
    */
    const allocations = allocateAllTasks(pool, running, pending);

    /*
      7. Spawn each pending task on its allocation.
    */
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
      const pid = this.ns.exec(path, controller.hostname, { threads: 1, temporary: true });
      if (pid === 0) {
        this.logger.warn(`failed to exec ${path} on ${controller.hostname}`);
        continue;
      }

      const totalRam = slices.reduce((sum, s) => sum + s.ram, 0);
      this.logger.info(
        `${id} on ${controller.hostname} → ${slices.length} hosts (${this.ns.format.ram(totalRam)}) pid=${pid}`,
      );

      this.taskState.tasks.set(id, {
        id: id,
        pid: pid,
        host: controller.hostname,
        shutdownRequested: false,
        status: "running",
        allocation: { taskId: id, servers: slices },
      } satisfies TaskState);
    }

    /*
      8. Auto-trigger reallocation when a requested task couldn't be placed
      AND there's an unbounded task running whose RAM might be reclaimable.
    */
    let unplaced = false;
    for (const [id, slices] of allocations) {
      if (running.has(id)) continue;
      if (slices.length === 0) {
        unplaced = true;
        break;
      }
    }
    if (unplaced && !this.reallocating) {
      let hasRunningUnbounded = false;
      for (const id of running.keys()) {
        const snap = this.taskState.tasks.get(id);
        if (snap?.status !== "running") continue; // skip stopping/shutdown-requested
        if (TASK_BY_ID.get(id)?.demand.unbounded) {
          hasRunningUnbounded = true;
          break;
        }
      }
      if (hasRunningUnbounded) {
        const ids = this.flagUnboundedForShutdown();
        if (ids.length > 0) {
          this.reallocating = true;
          this.restartIds = new Set(ids);
          this.logger.info(
            `reallocate: auto-triggered, requesting shutdown of ${ids.length} task(s): ${ids.join(", ")}`,
          );
        }
      }
    }

    /*
      9. Publish the task state
    */
    this.ns.clearPort(TASK_STATE_PORT);
    this.ns.writePort(TASK_STATE_PORT, this.taskState);
  }

  reallocate(): void {
    if (this.reallocating || !this.taskState) return;

    const ids = this.flagUnboundedForShutdown();
    if (ids.length === 0) return undefined;
    this.reallocating = true;
    this.restartIds = new Set(ids);
    this.logger.info(`reallocate: requesting shutdown of ${ids.length} task(s): ${ids.join(", ")}`);
  }

  get tasks(): Readonly<TaskManagerState> {
    return this.taskState;
  }

  get isBusy(): boolean {
    return this.reallocating;
  }

  // Marks each running unbounded task whose allocation is below its cap (or
  // uncapped) as `stopping`. Mutates `tasks` in place and returns the ids it
  // touched. Used by both the manual reallocate() entrypoint and the
  // auto-trigger inside runTick.
  private flagUnboundedForShutdown(): TaskId[] {
    const ids: TaskId[] = [];
    for (const task of this.taskState.tasks.values()) {
      if (task.status !== "running") continue;
      const def = TASK_BY_ID.get(task.id);
      if (!def?.demand.unbounded) continue;
      const allocRam = task.allocation?.servers.reduce((s, x) => s + x.ram, 0) ?? 0;
      const cap = def.demand.maxRamDemand;
      if (cap != null && allocRam >= cap) continue;
      task.shutdownRequested = true;
      task.status = "stopping";
      ids.push(task.id);
    }
    return ids;
  }
}
