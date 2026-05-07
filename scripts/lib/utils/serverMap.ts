import type { NS } from "@ns";

export interface ServerInfo {
  hostname: string;
  parent: string | null;
  depth: number;
  // Per-ancestor "draw vertical line" flags. Length = depth - 1 (covers
  // ancestors at depths 1..depth-1, since depth-0 root has no siblings to
  // thread through). rails[i] = true means an ancestor at depth i+1 has
  // later siblings, so a vertical guide line should pass through column i.
  rails: boolean[];
  // True if this node is the last child of its parent. The renderer uses
  // this to clip the leaf column's vertical line to the top half.
  isLastSibling: boolean;
  purchasedByPlayer: boolean;
  // Darknet servers have no port-hack model — we report 0/0 so the
  // "ports met" check reads as ready (which is moot since admin rights are
  // gated by Heartbleed/Authenticate, not NUKE).
  numOpenPortsRequired: number;
  openPortCount: number;
  cpuCores: number;
  ramUsed: number;
  maxRam: number;
  hasAdminRights: boolean;
  backdoorInstalled: boolean;
  // Darknet servers don't gate by hacking skill — we report 0 there so the
  // skill-gate check never fires for them.
  requiredHackingSkill: number;
}

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
      hostname: host,
      parent,
      depth,
      rails: [...rails],
      isLastSibling,
      purchasedByPlayer: data.purchasedByPlayer,
      numOpenPortsRequired: "numOpenPortsRequired" in data ? (data.numOpenPortsRequired ?? 0) : 0,
      openPortCount: "openPortCount" in data ? (data.openPortCount ?? 0) : 0,
      cpuCores: data.cpuCores,
      ramUsed: data.ramUsed,
      maxRam: data.maxRam,
      hasAdminRights: data.hasAdminRights,
      backdoorInstalled: data.backdoorInstalled ?? false,
      requiredHackingSkill: "requiredHackingSkill" in data ? (data.requiredHackingSkill ?? 0) : 0,
    });

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
