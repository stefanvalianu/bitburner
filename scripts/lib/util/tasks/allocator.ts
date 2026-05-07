import type { ServerInfo } from "../serverMap";
import type { Allocation, TaskId } from "./types";

export interface AllocateOpts {
  // Hostnames to exclude from the worker pool (e.g. "home" runs the
  // dashboard; controller-reserved hosts shouldn't be claimed too).
  exclude?: Set<string>;
}

// One unbounded task at a time. The manager has already decided which
// growUnbounded task (if any) is allowed to claim the worker fleet this
// tick — the allocator just hands it every eligible server. Controller-only
// tasks get empty allocations (they run on their controller host alone).
export function allocate(
  servers: ServerInfo[],
  unboundedTaskId: TaskId | null,
  controllerOnlyTaskIds: TaskId[],
  opts: AllocateOpts = {},
): Map<TaskId, Allocation> {
  const exclude = opts.exclude ?? new Set<string>();
  const result = new Map<TaskId, Allocation>();

  for (const id of controllerOnlyTaskIds) {
    result.set(id, { taskId: id, servers: [] });
  }

  if (!unboundedTaskId) return result;

  const slices = servers
    .filter((s) => s.hasAdminRights && !exclude.has(s.hostname) && s.maxRam > 0)
    .map((s) => ({ hostname: s.hostname, ram: s.maxRam, cores: s.cpuCores }))
    .sort((a, b) => b.ram - a.ram);

  result.set(unboundedTaskId, { taskId: unboundedTaskId, servers: slices });
  return result;
}
