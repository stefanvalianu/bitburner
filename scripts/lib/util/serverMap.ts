import type { DarknetServerData, NS, Server } from "@ns";

// ns.getServer returns either Server or a Darknet variant; mirroring both
// keeps the snapshot complete. Fields like requiredHackingSkill and
// numOpenPortsRequired only exist on the Server branch (Darknet servers omit
// them) — consumers should `?? 0` at the read site.
type RawServer = Server | (DarknetServerData & { isOnline: boolean });

export type ServerInfo = RawServer & {
  parent: string | null;
  // DFS depth from home; intentionally overrides DarknetServerData.depth
  // (which represents an unrelated net-depth concept).
  depth: number;
  // Per-ancestor "draw vertical line" flags. Length = depth - 1 (covers
  // ancestors at depths 1..depth-1, since depth-0 root has no siblings to
  // thread through). rails[i] = true means an ancestor at depth i+1 has
  // later siblings, so a vertical guide line should pass through column i.
  rails: boolean[];
  // True if this node is the last child of its parent. The renderer uses
  // this to clip the leaf column's vertical line to the top half.
  isLastSibling: boolean;
};

// DFS-walks the network starting from `root`, returning servers in traversal
// order (parents always before their children). ns.scan is bidirectional —
// every neighbor lists the caller back — so a visited set is required to
// avoid infinite recursion.
export function scanAll(ns: NS, root: string = "home"): ServerInfo[] {
  const result: ServerInfo[] = [];
  const visited = new Set<string>();

  function dfs(
    host: string,
    parent: string | null,
    depth: number,
    rails: boolean[],
    isLastSibling: boolean,
  ): void {
    if (visited.has(host)) return;
    visited.add(host);
    const data = ns.getServer(host);
    result.push({
      ...data,
      parent,
      depth,
      rails: [...rails],
      isLastSibling,
    } as ServerInfo);

    const children = ns.scan(host).filter((n) => !visited.has(n));
    // Skip appending a rail entry when this node is root — root has no
    // siblings, so depth-1 children render with zero rail columns.
    const childRails = depth >= 1 ? [...rails, !isLastSibling] : rails;
    for (let i = 0; i < children.length; i++) {
      dfs(children[i], host, depth + 1, childRails, i === children.length - 1);
    }
  }

  dfs(root, null, 0, [], true);
  return result;
}

// Convenience accessors for fields that only exist on the Server branch of
// ServerInfo. Darknet servers don't gate by hacking skill or open ports, so
// reporting 0 there makes the gate checks read as "satisfied" — which is
// correct: those servers are unlocked via Heartbleed/Authenticate, not NUKE.
export function requiredHackingSkill(s: ServerInfo): number {
  return "requiredHackingSkill" in s ? (s.requiredHackingSkill ?? 0) : 0;
}

export function numOpenPortsRequired(s: ServerInfo): number {
  return "numOpenPortsRequired" in s ? (s.numOpenPortsRequired ?? 0) : 0;
}

export function openPortCount(s: ServerInfo): number {
  return "openPortCount" in s ? (s.openPortCount ?? 0) : 0;
}

export function moneyMax(s: ServerInfo): number {
  return "moneyMax" in s ? (s.moneyMax ?? 0) : 0;
}
