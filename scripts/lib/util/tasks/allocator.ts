import type { ServerSlice, TaskDemand, TaskId } from "./types";

export interface Lease {
  leaseId: number;
  hostname: string;
  ram: number;
  cores: number;
}

interface PoolEntry {
  hostname: string;
  ram: number;
  cores: number;
}

// Stateful, demand-driven RAM allocator. Operates over a pool of
// ServerSlices and reserves RAM as `allocate()` is called. Used by
// TaskManager to assign tasks to hosts, and by tasks themselves to
// carve up their own allocation among child workers — same class,
// two pools.
export class Allocator {
  private readonly pool: Map<string, PoolEntry>;
  private readonly leases: Map<number, Lease>;

  // simple auto-incrementing id
  private leaseIncrement: number;

  constructor(slices: ServerSlice[]) {
    this.leases = new Map();
    this.pool = new Map();
    this.leaseIncrement = 0;

    for (const s of slices) {
      const existing = this.pool.get(s.hostname);
      if (existing) {
        existing.ram += s.ram;
      } else {
        this.pool.set(s.hostname, {
          hostname: s.hostname,
          ram: s.ram,
          cores: s.cores ?? 1,
        });
      }
    }
  }

  // Try to satisfy `demand`. Returns the slices reserved (empty array if
  // we can't even fit the entrypoint). Mutates the internal pool.
  //
  // For bounded demands: reserves exactly `entrypointRam`.
  // For unbounded demands: reserves up to `maxRamDemand` (or all available
  // if no cap), but never less than `entrypointRam` if the task can't
  // start otherwise.
  allocate(demand: TaskDemand): ServerSlice[] {
    let target: number;
    if (!demand.unbounded) {
      target = demand.entrypointRam;
    } else {
      target = demand.maxRamDemand ?? Infinity;
    }
    // The controller must fit somewhere — bump the target up to entrypointRam
    // even if the cap is smaller, so a starved task either runs or fails cleanly.
    target = Math.max(target, demand.entrypointRam);

    const sorted = this.sortedHosts(demand.prioritizeCores ?? false);

    // The biggest host must be able to host the controller; otherwise
    // there's no point reserving fragments — the task can't start.
    if (sorted.length === 0 || sorted[0].ram < demand.entrypointRam) return [];

    const result: ServerSlice[] = [];
    let reserved = 0;
    for (const host of sorted) {
      if (reserved >= target) break;
      if (host.ram <= 0) continue;
      const take = Math.min(host.ram, target - reserved);
      result.push({ hostname: host.hostname, ram: take, cores: host.cores });
      host.ram -= take;
      reserved += take;
    }
    return result;
  }

  // Inspect the host that `leaseUpTo` would draw from next without
  // mutating the pool. Useful when the caller wants to size its lease
  // request based on the host's cores (e.g. weaken/grow efficiency).
  peekTopHost(): { hostname: string; ram: number; cores: number } | null {
    const sorted = this.sortedHosts(false);
    if (sorted.length === 0) return null;
    if (Math.floor(sorted[0].ram) === 0) return null;
    return { hostname: sorted[0].hostname, ram: sorted[0].ram, cores: sorted[0].cores };
  }

  // Similar to `lease` but finds the biggest possible contiguous block
  // up to the requested ram. Useful if you're OK to grow script threads
  // irresponsibly large. If `ram` is not provided, will return the biggest
  // slot.
  leaseUpTo(ram?: number): Lease | null {
    // let's always prefer highCPU nodes, we already own them, might as well use em
    const sorted = this.sortedHosts(false);
    if (sorted.length === 0) return null;
    if (Math.floor(sorted[0].ram) === 0) return null;

    const leaseRam = ram ? Math.min(sorted[0].ram, ram) : sorted[0].ram;

    return this.lease(leaseRam);
  }

  // This aims to have a much simpler contract meant for scripts to grab
  // a slice of their available allocation for usage/consumption. It is
  // important for callers to understand that whatever they are running
  // on their lease is finished, so they can properly `return` the space.
  lease(ram: number): Lease | null {
    ram = Math.floor(ram);
    const sorted = this.sortedHosts(false);

    // failed to obtain a lease
    if (sorted.length === 0 || sorted[0].ram < ram || Math.floor(sorted[0].ram) === 0) return null;

    // reserve it on the host
    sorted[0].ram -= ram;

    const lease = {
      leaseId: this.leaseIncrement++,
      hostname: sorted[0].hostname,
      ram: ram,
      cores: sorted[0].cores,
    };

    this.leases.set(lease.leaseId, lease);
    return lease;
  }

  // Callers should free their leases when they're done, otherwise the
  // allocation will be lost (within this class). Returns false on error
  return(leaseId: number): boolean {
    const lease = this.leases.get(leaseId);
    if (!lease) return false;

    const host = this.pool.get(lease.hostname);
    if (!host) return false;

    host.ram += lease.ram;
    this.leases.delete(leaseId);

    return true;
  }

  // Lock RAM out of the pool (used to mark already-running tasks' slices
  // as unavailable before the priority pipeline allocates pending tasks).
  reserve(slices: ServerSlice[]): void {
    for (const slice of slices) {
      const host = this.pool.get(slice.hostname);
      if (!host) continue;
      host.ram = Math.max(0, host.ram - slice.ram);
    }
  }

  totalFree(): number {
    let sum = 0;
    for (const h of this.pool.values()) sum += h.ram;
    return sum;
  }

  private sortedHosts(prioritizeCores: boolean): PoolEntry[] {
    const entries = [...this.pool.values()];
    if (prioritizeCores) {
      entries.sort((a, b) => b.cores - a.cores || b.ram - a.ram);
    } else {
      entries.sort((a, b) => b.ram - a.ram);
    }
    return entries;
  }
}

// Priority-aware bulk allocation. Locks running task RAM out of the pool,
// then allocates pending demands in order:
//   1. critical priority before normal
//   2. within a priority: bounded → ram-limited unbounded → truly unlimited
//   3. ram-limited unbounded oversubscription splits proportionally to maxRamDemand
//   4. truly unlimited splits the remainder equally
export function allocateAllTasks(
  pool: ServerSlice[],
  running: Map<TaskId, ServerSlice[]>,
  pending: Map<TaskId, TaskDemand>,
): Map<TaskId, ServerSlice[]> {
  const a = new Allocator(pool);
  const result = new Map<TaskId, ServerSlice[]>();

  for (const [id, slices] of running) {
    a.reserve(slices);
    result.set(id, slices);
  }

  for (const priority of ["critical", "normal"] as const) {
    const atPriority: [TaskId, TaskDemand][] = [];
    for (const [id, d] of pending) {
      if (d.priority === priority) atPriority.push([id, d]);
    }
    if (atPriority.length === 0) continue;

    const bounded = atPriority.filter(([, d]) => !d.unbounded);
    const ramLimited = atPriority.filter(([, d]) => d.unbounded && d.maxRamDemand !== undefined);
    const unlimited = atPriority.filter(([, d]) => d.unbounded && d.maxRamDemand === undefined);

    for (const [id, d] of bounded) {
      result.set(id, a.allocate(d));
    }

    if (ramLimited.length > 0) {
      const totalDemand = ramLimited.reduce((s, [, d]) => s + (d.maxRamDemand ?? 0), 0);
      const free = a.totalFree();
      const scale = totalDemand <= free ? 1 : free / totalDemand;
      for (const [id, d] of ramLimited) {
        const cap = Math.floor((d.maxRamDemand ?? 0) * scale);
        result.set(id, a.allocate({ ...d, maxRamDemand: cap }));
      }
    }

    if (unlimited.length > 0) {
      const free = a.totalFree();
      const shared = Math.floor(free / unlimited.length);
      for (const [id, d] of unlimited) {
        result.set(id, a.allocate({ ...d, maxRamDemand: shared }));
      }
    }
  }

  return result;
}
