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
