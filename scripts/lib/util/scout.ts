import type { NS } from "@ns";
import { SCOUT_PORT } from "./ports";

export interface ScoutState {
  target: string;
  available: string[];
}

interface AvailableCandidate {
  hostname: string;
  hasAdminRights: boolean;
  purchasedByPlayer?: boolean;
  moneyMax?: number;
}

export function getScoutState(ns: NS): ScoutState | null {
  const raw = ns.peek(SCOUT_PORT);
  if (raw === "NULL PORT DATA") return null;
  try {
    return JSON.parse(raw as string) as ScoutState;
  } catch {
    return null;
  }
}

export function setScoutState(ns: NS, s: ScoutState): void {
  ns.clearPort(SCOUT_PORT);
  ns.writePort(SCOUT_PORT, JSON.stringify(s));
}

// Filter + sort to produce the canonical "available servers" snapshot used
// for both target selection and change detection. Keeping it in one place
// guarantees the snapshot scout-server writes matches what priority functions
// later compare against.
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
