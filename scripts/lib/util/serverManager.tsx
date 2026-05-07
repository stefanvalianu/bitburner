import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useGameState } from "./gameState";
import { useLogger } from "./log";
import { useNs } from "./ns";
import { allocate } from "./tasks/allocator";
import { drainChildReports } from "./tasks/protocol";
import { TASKS } from "./tasks/registry";
import type { ActiveTask, TaskDefinition, TaskId } from "./tasks/types";
import type { ServerInfo } from "./serverMap";
import type { NS } from "@ns";

const DEFAULT_TICK_MS = 60_000;

// Home runs the dashboard and is preferred for controllers, but gets excluded
// from the *worker* allocation pool so worker RAM and controller RAM don't
// compete on the same accounting.
const EXCLUDE_WORKERS_FROM = new Set(["home"]);

// Pick a host to run a controller on. Prefers home; falls back to the
// smallest non-home admin server that fits. The controller's host is added
// to `reserved` by the caller so the worker allocator doesn't claim it too.
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

// Canonical string for a (placement, allocation) pair, used to detect
// whether a tick produces the same plan as the current state. Equal keys =>
// no kill/respawn (HWGW cycles keep running).
function planKey(
  tasks: { taskId: TaskId; controllerHost: string; servers: { hostname: string; ram: number }[] }[],
): string {
  return [...tasks]
    .sort((a, b) => a.taskId.localeCompare(b.taskId))
    .map((t) => {
      const slices = [...t.servers]
        .sort((x, y) => x.hostname.localeCompare(y.hostname))
        .map((s) => `${s.hostname}:${s.ram}`)
        .join(",");
      return `${t.taskId}@${t.controllerHost}=[${slices}]`;
    })
    .join("|");
}

export interface ServerManagerApi {
  activeTasks: ActiveTask[];
  lastTickAt: number | null;
  // Kill every tracked controller and its reported worker children. Does not
  // exit the dashboard itself — the caller decides whether to follow with
  // ns.exit() (e.g. the kill-all button does, the per-task UI wouldn't).
  killAll: () => void;
}

const ServerManagerContext = createContext<ServerManagerApi | null>(null);

// Owns the active task ledger and runs the rebalance loop. Mounts inside
// GameStateProvider because each tick consults the latest server snapshot
// and game stats to score task priorities.
export function ServerManagerProvider({
  tickMs = DEFAULT_TICK_MS,
  children,
}: {
  tickMs?: number;
  children: ReactNode;
}) {
  const ns = useNs();
  const log = useLogger("manager");
  const state = useGameState();
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);

  // Refs hold the latest snapshots so the polling effect doesn't list them
  // as deps (which would tear down and re-install the interval on every
  // gameState tick — every 10s — and risk dropping inbound child reports).
  const activeRef = useRef<ActiveTask[]>(activeTasks);
  activeRef.current = activeTasks;
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const runTick = () => {
      const snapshot = stateRef.current;

      // 1. Drain child reports and merge into the live ledger. Reports for
      //    tasks that died between ticks are dropped on the floor.
      const reports = drainChildReports(ns);
      let next = activeRef.current.map((t) => ({ ...t, childPids: [...t.childPids] }));
      for (const r of reports) {
        const slot = next.find((t) => t.taskId === r.taskId);
        if (slot && !slot.childPids.includes(r.pid)) slot.childPids.push(r.pid);
      }

      // 2. Reap task pids that died (manual kill, exec failure, etc.) so we
      //    don't try to kill them again. Their child pids stay tracked —
      //    they may still be running; the rebalance pass below will clean up.
      next = next.filter((t) => {
        if (ns.isRunning(t.pid)) return true;
        log.info(`task ${t.taskId} pid ${t.pid} died; will respawn`);
        return false;
      });

      // 3. Decide where each controller will run, in priority order. Higher-
      //    priority tasks pick their host first (matters when home only has
      //    room for one controller). Reserve non-home picks so the worker
      //    allocator doesn't claim them.
      const ourHomeFootprint = next
        .filter((t) => t.controllerHost === "home")
        .reduce((sum, t) => sum + t.controllerRam, 0);
      // Drop priority-0 tasks before placement: they shouldn't run, period.
      // (Previously the empty-allocation skip in step 5/7 caught this, but
      // tasks that don't request worker RAM legitimately have empty
      // allocations even when running, so we have to gate on priority here.)
      const orderedDefs: TaskDefinition[] = [...TASKS]
        .filter((t) => t.priority(snapshot) > 0)
        .sort((a, b) => b.priority(snapshot) - a.priority(snapshot));
      const placements = new Map<TaskId, { host: string; ram: number }>();
      const reserved = new Set<string>();
      for (const def of orderedDefs) {
        const ram = ns.getScriptRam(def.scriptPath);
        if (ram === 0) {
          log.error(`script not found: ${def.scriptPath}`);
          continue;
        }
        const host = pickControllerHost(ns, snapshot.servers, ram, ourHomeFootprint, reserved);
        if (!host) {
          log.warn(`no host fits ${def.id} controller (${ram}GB)`);
          continue;
        }
        placements.set(def.id, { host, ram });
        if (host !== "home") reserved.add(host);
      }

      // 4. Compute worker allocation, excluding home and any controller-
      //    reserved hosts so workers and controllers don't fight over RAM.
      const exclude = new Set([...EXCLUDE_WORKERS_FROM, ...reserved]);
      const target = allocate(snapshot.servers, TASKS, snapshot, { exclude });

      // 5. Build a canonical plan key (placement + worker slices) and skip
      //    the rebalance entirely if it matches the current state.
      const targetPlan = TASKS.flatMap((def) => {
        const place = placements.get(def.id);
        const alloc = target.get(def.id);
        if (!place || !alloc) return [];
        // RAM-hungry tasks need at least one worker server to be useful;
        // controller-only tasks can run with an empty allocation.
        if (def.requestsAllRam && alloc.servers.length === 0) return [];
        return [{ taskId: def.id, controllerHost: place.host, servers: alloc.servers }];
      });
      const currentPlan = next.map((t) => ({
        taskId: t.taskId,
        controllerHost: t.controllerHost,
        servers: t.allocation.servers,
      }));
      if (planKey(currentPlan) === planKey(targetPlan)) {
        activeRef.current = next;
        setActiveTasks(next);
        setLastTickAt(Date.now());
        return;
      }

      // 6. Plan changed — kill the old tree.
      for (const t of next) {
        for (const pid of t.childPids) {
          if (ns.isRunning(pid)) ns.kill(pid);
        }
        if (ns.isRunning(t.pid)) ns.kill(t.pid);
      }

      // 7. Spawn new controllers on their chosen hosts. Each gets its
      //    Allocation JSON as ns.args[0]. scp first if not home — propagate
      //    usually has copies in place but a per-spawn scp is cheap insurance.
      const fresh: ActiveTask[] = [];
      for (const def of TASKS) {
        const place = placements.get(def.id);
        const allocation = target.get(def.id);
        if (!place || !allocation) {
          log.info(`skip ${def.id}: no placement`);
          continue;
        }
        if (def.requestsAllRam && allocation.servers.length === 0) {
          log.info(`skip ${def.id}: requested all RAM but no worker servers available`);
          continue;
        }
        if (place.host !== "home") {
          ns.scp(def.scriptPath, place.host, "home");
        }
        const arg = JSON.stringify(allocation);
        const pid = ns.exec(def.scriptPath, place.host, 1, arg);
        if (pid === 0) {
          log.warn(`failed to exec ${def.scriptPath} on ${place.host}`);
          continue;
        }
        const totalRam = allocation.servers.reduce((sum, s) => sum + s.ram, 0);
        log.info(
          `${def.id} on ${place.host} → ${allocation.servers.length} hosts (${totalRam}GB) pid=${pid}`,
        );
        fresh.push({
          taskId: def.id,
          pid,
          controllerHost: place.host,
          controllerRam: place.ram,
          allocation,
          childPids: [],
        });
      }

      activeRef.current = fresh;
      setActiveTasks(fresh);
      setLastTickAt(Date.now());
    };

    // Run once immediately so first allocation isn't delayed by tickMs.
    runTick();
    const id = setInterval(runTick, tickMs);
    return () => clearInterval(id);
  }, [ns, log, tickMs]);

  const api = useMemo<ServerManagerApi>(
    () => ({
      activeTasks,
      lastTickAt,
      killAll: () => {
        // Read from the ref so we always operate on the latest ledger,
        // including any reports drained between renders.
        const tasks = activeRef.current;
        for (const t of tasks) {
          for (const pid of t.childPids) {
            if (ns.isRunning(pid)) ns.kill(pid);
          }
          if (ns.isRunning(t.pid)) ns.kill(t.pid);
        }
        activeRef.current = [];
        setActiveTasks([]);
        log.info(`killed ${tasks.length} task(s) and their workers`);
      },
    }),
    [ns, log, activeTasks, lastTickAt],
  );

  return <ServerManagerContext.Provider value={api}>{children}</ServerManagerContext.Provider>;
}

export function useServerManager(): ServerManagerApi {
  const v = useContext(ServerManagerContext);
  if (!v) throw new Error("useServerManager must be used inside <ServerManagerProvider>");
  return v;
}
