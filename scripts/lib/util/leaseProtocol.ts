import type { NS } from "@ns";
import { SERVER_MANAGEMENT_PORT } from "./ports";
import type { LeasePurpose } from "./leasePolicy";

// Inbound = client → dashboard. Both request and release flow through
// SERVER_MANAGEMENT_PORT; the dashboard drains the port each tick.
export type LeaseRequest = {
  type: "request";
  id: string;
  purpose: LeasePurpose;
  ramNeeded?: number;
  replyPort: number;
  pid: number;
};

export type LeaseRelease = {
  type: "release";
  leaseId: string;
};

export type LeaseInbound = LeaseRequest | LeaseRelease;

export type LeaseResponse =
  | {
      type: "response";
      id: string;
      granted: true;
      leaseId: string;
      hostname: string;
      ramReserved: number;
    }
  | {
      type: "response";
      id: string;
      granted: false;
      reason: string;
    };

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function writeLeaseRequest(ns: NS, msg: LeaseRequest): void {
  ns.getPortHandle(SERVER_MANAGEMENT_PORT).write(JSON.stringify(msg));
}

export function writeLeaseRelease(ns: NS, leaseId: string): void {
  const msg: LeaseRelease = { type: "release", leaseId };
  ns.getPortHandle(SERVER_MANAGEMENT_PORT).write(JSON.stringify(msg));
}

// Drains all currently queued inbound messages. Malformed entries are skipped
// silently — a corrupted message shouldn't stall the whole queue.
export function drainInbound(ns: NS): LeaseInbound[] {
  const port = ns.getPortHandle(SERVER_MANAGEMENT_PORT);
  const out: LeaseInbound[] = [];
  while (!port.empty()) {
    const raw = port.read();
    if (typeof raw !== "string") continue;
    try {
      const parsed = JSON.parse(raw) as LeaseInbound;
      if (parsed.type === "request" || parsed.type === "release") out.push(parsed);
    } catch {
      // ignore malformed payloads
    }
  }
  return out;
}

export function writeLeaseResponse(ns: NS, replyPort: number, msg: LeaseResponse): void {
  ns.getPortHandle(replyPort).write(JSON.stringify(msg));
}

// Polls the reply port for a response matching `id`. Non-matching responses
// are dropped — the client owns its reply port (replyPort = ns.pid), so the
// only way a foreign response shows up is a stale one from a previous request
// that timed out, which we don't want to deliver to a different awaiter.
export async function awaitResponse(
  ns: NS,
  replyPort: number,
  id: string,
  timeoutMs: number,
): Promise<LeaseResponse | null> {
  const port = ns.getPortHandle(replyPort);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    while (!port.empty()) {
      const raw = port.read();
      if (typeof raw !== "string") continue;
      try {
        const parsed = JSON.parse(raw) as LeaseResponse;
        if (parsed.type === "response" && parsed.id === id) return parsed;
      } catch {
        // ignore malformed payloads
      }
    }
    await ns.asleep(50);
  }
  return null;
}
