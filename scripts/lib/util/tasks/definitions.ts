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
// needsRerun. Defined once here so the snapshot scout writes matches what
// needsRerun later compares against.
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
    id: "scout-server",
    scriptPath: "lib/features/scout-server.js",
    requirements: {}, // controller-only
    initialState: { available: [], target: null } satisfies ScoutTaskState,
    needsRerun: (game, state) => {
      const current = availableHostnames(game.servers);
      const stored = (state as TaskState<ScoutTaskState>).available;
      return !snapshotsEqual(current, stored);
    },
  },
  {
    id: "hack-v1",
    scriptPath: "lib/features/hack-controller-v1.js",
    requirements: { growUnbounded: true },
    initialState: { target: null } satisfies HackTaskState,
    needsRerun: (_game, state, snapshot) => {
      if (_game.inventory.hasFormulas) return false; // hack-v1 is a weaker version of hack-v2 without access to formulas / their RAM consumption
      const scoutSlot = snapshot["scout-server"] as TaskState<ScoutTaskState> | undefined;
      const desired = scoutSlot?.target ?? null;
      const myTarget = (state as TaskState<HackTaskState>).target;
      // Only run when scout has produced a target, and only restart when
      // that target differs from the one the current run was started with.
      return desired !== null && desired !== myTarget;
    },
  },
];
