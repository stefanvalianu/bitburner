import { NS, Server } from "@ns";

/*
  Simple BFS to crawl the list of servers and return their info.
  This is a common function as the core app requires accurate
  access to server info before any sub-tasks are spawned (to place tasks)
*/
export function crawlServers(ns: NS): Server[] {
  const visited = new Map<string, Server>();
  const queue: string[] = ["home"];

  while (queue.length > 0) {
    const hostname = queue.shift()!;
    if (visited.has(hostname)) continue;
    visited.set(hostname, ns.getServer(hostname));

    for (const neighbor of ns.scan(hostname)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }

  return Array.from(visited.values());
}
