import type { NS } from "@ns";
import { writeChildReport } from "./protocol";
import type { Allocation, TaskId } from "./types";

// Task scripts are spawned with their Allocation JSON-encoded as ns.args[0].
// Throws if the arg is missing or malformed — that's a programmer error in
// the manager, not something the task can recover from.
export function readAllocation(ns: NS): Allocation {
  const raw = ns.args[0];
  if (typeof raw !== "string") {
    throw new Error(`task missing allocation arg (got ${typeof raw})`);
  }
  return JSON.parse(raw) as Allocation;
}

// Report a spawned worker's PID upstream so the manager can kill it on the
// next rebalance. Call once per ns.exec — there's no batching path; the port
// is FIFO and the manager drains it every tick.
export function reportChild(ns: NS, taskId: TaskId, pid: number, hostname: string): void {
  if (pid === 0) return; // ns.exec returns 0 on failure — nothing to track
  writeChildReport(ns, { type: "child", taskId, pid, hostname });
}
