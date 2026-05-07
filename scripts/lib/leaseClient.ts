import type { NS } from "@ns";
import type { LeasePurpose } from "./utils/leasePolicy";
import { awaitResponse, newId, writeLeaseRelease, writeLeaseRequest } from "./utils/leaseProtocol";

export interface GrantedLease {
  leaseId: string;
  hostname: string;
  ramReserved: number;
}

// Sends a lease request to the dashboard and waits for a response on the
// caller's PID-numbered reply port. Returns null on denial or timeout — the
// caller decides whether to retry, back off, or surface the failure.
export async function requestServer(
  ns: NS,
  opts: { purpose: LeasePurpose; ramNeeded?: number; timeoutMs?: number },
): Promise<GrantedLease | null> {
  const id = newId();
  const replyPort = ns.pid;
  writeLeaseRequest(ns, {
    type: "request",
    id,
    purpose: opts.purpose,
    ramNeeded: opts.ramNeeded,
    replyPort,
    pid: ns.pid,
  });
  const resp = await awaitResponse(ns, replyPort, id, opts.timeoutMs ?? 2000);
  if (!resp || !resp.granted) return null;
  return {
    leaseId: resp.leaseId,
    hostname: resp.hostname,
    ramReserved: resp.ramReserved,
  };
}

export function releaseLease(ns: NS, leaseId: string): void {
  writeLeaseRelease(ns, leaseId);
}
