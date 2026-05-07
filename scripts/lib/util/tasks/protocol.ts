import type { NS } from "@ns";
import { TASK_REPORT_PORT } from "../ports";
import type { TaskId } from "./types";

// Tasks emit a ChildReport for every worker process they spawn so the manager
// can kill the whole tree on rebalance without each task implementing its own
// shutdown protocol.
export interface ChildReport {
  type: "child";
  taskId: TaskId;
  pid: number;
  hostname: string;
}

export function writeChildReport(ns: NS, msg: ChildReport): void {
  ns.getPortHandle(TASK_REPORT_PORT).write(JSON.stringify(msg));
}

export function drainChildReports(ns: NS): ChildReport[] {
  const port = ns.getPortHandle(TASK_REPORT_PORT);
  const out: ChildReport[] = [];
  while (!port.empty()) {
    const raw = port.read();
    if (typeof raw !== "string") continue;
    try {
      const parsed = JSON.parse(raw) as ChildReport;
      if (parsed.type === "child") out.push(parsed);
    } catch {
      // ignore malformed payloads
    }
  }
  return out;
}
