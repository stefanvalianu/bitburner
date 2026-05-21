import { NS } from "@ns";
import { IDENTIFY_SERVERS_PORT } from "@repo/common/ports";
import { crawlServers } from "@repo/common/crawlServers";

/*
  This script is responsible for:
  - Getting the full list of non-cloud servers names (home + npc ones), writing it to a port

  It's primarily used for a minor optimization to avoid the BFS crawl every second in mine-servers
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const servers = crawlServers(ns);

  let names: string[] = ["home"];

  for (const server of servers) {
    if (!server.purchasedByPlayer) {
      names.push(server.hostname);
    }
  }

  ns.clearPort(IDENTIFY_SERVERS_PORT);
  ns.writePort(IDENTIFY_SERVERS_PORT, names);
}
