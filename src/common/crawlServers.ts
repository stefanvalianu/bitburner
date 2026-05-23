import { NS, Server } from "@ns";

export interface ServerInfo {
  hostname: string;

  parent: ServerInfo | null;
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

  server: Server;
}

/*
  Simple BFS to crawl the list of servers and return their info.
  This is a common function as the core app requires accurate
  access to server info before any sub-tasks are spawned (to place tasks)
*/
export function crawlServers(ns: NS, includeDarknet?: boolean): Server[] {
  const visited = new Map<string, Server>();
  const queue: string[] = ["home"];

  while (queue.length > 0) {
    const hostname = queue.shift()!;
    if (visited.has(hostname)) continue;

    const cur = ns.getServer(hostname);
    if (!includeDarknet && cur.isOnline !== undefined) continue; // skip darknet servers
    visited.set(hostname, cur);

    for (const neighbor of ns.scan(hostname)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return Array.from(visited.values());
}

export function crawlServersWithHierarchy(ns: NS, root: string = "home"): ServerInfo[] {
  const result: ServerInfo[] = [];
  const visited = new Set<string>();

  function dfs(
    host: string,
    parent: ServerInfo | null,
    depth: number,
    rails: boolean[],
    isLastSibling: boolean,
  ): void {
    if (visited.has(host)) return;
    visited.add(host);
    const data = ns.getServer(host);

    const us = {
      hostname: data.hostname,
      parent,
      depth,
      rails: [...rails],
      isLastSibling,
      server: data,
    } satisfies ServerInfo;

    result.push(us);

    const children = ns.scan(host).filter((n) => !visited.has(n));
    // Skip appending a rail entry when this node is root — root has no
    // siblings, so depth-1 children render with zero rail columns.
    const childRails = depth >= 1 ? [...rails, !isLastSibling] : rails;
    for (let i = 0; i < children.length; i++) {
      dfs(children[i], us, depth + 1, childRails, i === children.length - 1);
    }
  }

  dfs(root, null, 0, [], true);
  return result;
}
