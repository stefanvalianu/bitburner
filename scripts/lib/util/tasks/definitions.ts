import { SCOUT_SERVER_TASK_ID, HACK_V1_TASK_ID, SERVER_SHARE_TASK_ID } from "./ids";
import type { TaskDefinition, TaskState } from "./types";

// ---------------------------------------------------------------------------
// Per-task state shapes
// ---------------------------------------------------------------------------

export interface ScoutTaskState extends Record<string, unknown> {
  available: string[]; // sorted, normalized list of currently-hackable hostnames
  target: string | null; // best target by moneyMax among `available`
}

export interface HackTaskState extends Record<string, unknown> {
  target: string | null; // the target this hack run was started against
}

// ---------------------------------------------------------------------------
// Helpers shared between the scout-server script and its definition's
// evaluate. Defined once here so the snapshot scout writes matches what
// evaluate later compares against.
// ---------------------------------------------------------------------------

interface AvailableCandidate {
  hostname: string;
  hasAdminRights: boolean;
  purchasedByPlayer?: boolean;
  moneyMax?: number;
}

export function availableHostnames(servers: AvailableCandidate[]): string[] {
  return servers
    .filter((s) => s.hasAdminRights && !s.purchasedByPlayer && (s.moneyMax ?? 0) > 0)
    .map((s) => s.hostname)
    .sort();
}

export function snapshotsEqual(
  a: string[] | null | undefined,
  b: string[] | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// TASKS
//
// Order matters: when multiple growUnbounded tasks would run on the same
// tick, the manager picks the first one in this list. Keep the most
// important growUnbounded task at the top.
// ---------------------------------------------------------------------------

export const TASKS: TaskDefinition[] = [
  {
    id: SCOUT_SERVER_TASK_ID,
    scriptPath: "lib/tasks/scout-server.js",
    requirements: {}, // controller-only
    initialState: { available: [], target: null } satisfies ScoutTaskState,
    evaluate: (game, state) => {
      // todo temp
      return "no-change";

      const current = availableHostnames(game.servers);
      const stored = (state as TaskState<ScoutTaskState>).available;
      return snapshotsEqual(current, stored) ? "no-change" : "restart";
    },
  },
  {
    id: HACK_V1_TASK_ID,
    scriptPath: "lib/tasks/hack-controller-v1.js",
    requirements: { growUnbounded: true },
    initialState: { target: null } satisfies HackTaskState,
    evaluate: (game, state, snapshot) => {
      // todo temp
      return "no-change";

      const hackv1Slot = snapshot.tasks["hack-v1"] as TaskState<HackTaskState> | undefined;

      // hack-v1 is a weaker version of hack-v2 — once formulas are
      // available, retire any running v1 and don't respawn.
      if (game.inventory.hasFormulas) {
        if (hackv1Slot && hackv1Slot.status === "running") {
          return "shutdown";
        }

        return "no-change";
      }

      const scoutSlot = snapshot.tasks[SCOUT_SERVER_TASK_ID] as
        | TaskState<ScoutTaskState>
        | undefined;
      const desired = scoutSlot?.target ?? null;
      const myTarget = (state as TaskState<HackTaskState>).target;
      // Only run when scout has produced a target, and only restart when
      // that target differs from the one the current run was started with.
      return desired !== null && desired !== myTarget ? "restart" : "no-change";
    },
  },
  {
    id: SERVER_SHARE_TASK_ID,
    scriptPath: "lib/tasks/server-share.js",
    requirements: { growUnbounded: true },
    initialState: {},
    evaluate: (game, state, snapshot) => {
      const shareSlot = snapshot.tasks[SERVER_SHARE_TASK_ID] as TaskState | undefined;
      if (shareSlot?.status === "running") return "no-change";
      return "restart";
    },
  },
];
