import type { ServerInfo } from "./serverMap";

export type LeasePurpose = "hack";

export interface Lease {
  id: string;
  hostname: string;
  purpose: LeasePurpose;
  // GB reserved on the host. 0 = whole-server claim (no other leases admitted).
  ramReserved: number;
  pid: number;
  grantedAt: number;
}

export interface RuleContext {
  purpose: LeasePurpose;
  ramNeeded?: number;
  freeRamOf: (hostname: string) => number;
}

// Score -Infinity = ineligible. Otherwise rule scores sum and the highest
// total wins. Keeping rules as plain functions makes it cheap to add new ones
// (or branch on ctx.purpose) without changing the evaluator.
export type Rule = (server: ServerInfo, ctx: RuleContext) => number;

const notHome: Rule = (s) => (s.hostname === "home" ? -Infinity : 0);

const mustHaveAdmin: Rule = (s) => (s.hasAdminRights ? 0 : -Infinity);

const mustFitRam: Rule = (s, ctx) => {
  if (ctx.ramNeeded === undefined) return 0;
  return ctx.freeRamOf(s.hostname) >= ctx.ramNeeded ? 0 : -Infinity;
};

const preferLargerRam: Rule = (s) => Math.log2(Math.max(1, s.maxRam));

export const DEFAULT_RULES: Rule[] = [notHome, mustHaveAdmin, mustFitRam, preferLargerRam];

export function scoreServer(
  server: ServerInfo,
  ctx: RuleContext,
  rules: Rule[] = DEFAULT_RULES,
): number {
  let total = 0;
  for (const rule of rules) {
    const r = rule(server, ctx);
    if (r === -Infinity) return -Infinity;
    total += r;
  }
  return total;
}

export function pickServer(
  servers: ServerInfo[],
  ctx: RuleContext,
  rules: Rule[] = DEFAULT_RULES,
): ServerInfo | null {
  let best: { s: ServerInfo; score: number } | null = null;
  for (const s of servers) {
    const score = scoreServer(s, ctx, rules);
    if (score === -Infinity) continue;
    if (!best || score > best.score) best = { s, score };
  }
  return best?.s ?? null;
}

// Free RAM accounting for a host: the SDK's ramUsed reflects scripts already
// running; lease reservations sit on top. A whole-server lease (ramReserved=0)
// blocks any further allocation by collapsing free RAM to 0.
export function freeRamForHost(servers: ServerInfo[], leases: Lease[], hostname: string): number {
  const server = servers.find((s) => s.hostname === hostname);
  if (!server) return 0;
  const onHost = leases.filter((l) => l.hostname === hostname);
  if (onHost.some((l) => l.ramReserved === 0)) return 0;
  const reserved = onHost.reduce((sum, l) => sum + l.ramReserved, 0);
  return Math.max(0, server.maxRam - server.ramUsed - reserved);
}
