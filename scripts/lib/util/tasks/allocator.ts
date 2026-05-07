import type { ServerInfo } from "../serverMap";
import type { GameState } from "../gameState";
import type { Allocation, ServerSlice, TaskDefinition, TaskId } from "./types";

export interface AllocateOpts {
  // Hostnames to exclude from allocation (e.g. "home" — runs the dashboard).
  exclude?: Set<string>;
}

// Whole-server greedy fit. Each task gets a budget proportional to its
// priority weight, then claims whole servers (largest free RAM first) until
// the budget is met. A server is only ever in one task's allocation per tick;
// tasks later in priority order may starve when capacity is tight.
export function allocate(
  servers: ServerInfo[],
  tasks: TaskDefinition[],
  state: GameState,
  opts: AllocateOpts = {},
): Map<TaskId, Allocation> {
  const exclude = opts.exclude ?? new Set<string>();
  const eligible = servers
    .filter((s) => s.hasAdminRights && !exclude.has(s.hostname) && s.maxRam > 0)
    .map((s) => ({ hostname: s.hostname, ram: s.maxRam }))
    .sort((a, b) => b.ram - a.ram);

  const totalRam = eligible.reduce((sum, s) => sum + s.ram, 0);

  // Tasks that don't opt into the worker fleet get empty allocations and are
  // excluded from weight calculations entirely — they run on their controller
  // host only.
  const ramHungry = tasks.filter((t) => t.requestsAllRam === true);
  const weights = ramHungry.map((t) => ({ task: t, weight: Math.max(0, t.priority(state)) }));
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);

  const result = new Map<TaskId, Allocation>();
  for (const t of tasks) {
    if (t.requestsAllRam !== true) result.set(t.id, { taskId: t.id, servers: [] });
  }
  if (totalWeight === 0 || totalRam === 0) {
    for (const t of ramHungry) result.set(t.id, { taskId: t.id, servers: [] });
    return result;
  }

  // Order tasks by priority share (highest first) so the largest claimants
  // get first pick of the largest hosts.
  const ordered = [...weights].sort((a, b) => b.weight - a.weight);

  let remaining: ServerSlice[] = eligible;
  for (const { task, weight } of ordered) {
    const budget = Math.ceil((weight / totalWeight) * totalRam);
    const claimed: ServerSlice[] = [];
    let claimedRam = 0;
    const leftover: ServerSlice[] = [];
    for (const s of remaining) {
      if (claimedRam < budget) {
        claimed.push(s);
        claimedRam += s.ram;
      } else {
        leftover.push(s);
      }
    }
    result.set(task.id, { taskId: task.id, servers: claimed });
    remaining = leftover;
  }

  // Defensive fallback: any RAM-hungry task that didn't get filled in above
  // (shouldn't happen) gets an empty allocation rather than being missing.
  for (const t of ramHungry) {
    if (!result.has(t.id)) result.set(t.id, { taskId: t.id, servers: [] });
  }
  return result;
}
