import { NS } from "@ns";
import { invokeNextScript } from "./helpers";
import { getPortData, IDENTIFY_SERVERS_PORT, SERVER_INFO_PORT } from "@repo/common/ports";
import { Server, ServerInfo } from "@repo/common/info/serverInfo";

/*
  This script is responsible for:
  - Attempting to nuke all eligible servers
  - Getting the information of each server (money, security, etc).
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  // should be quicker than crawling each second
  let hostnames = getPortData<string[]>(ns, IDENTIFY_SERVERS_PORT)!;
  hostnames.push(...ns.cloud.getServerNames());

  let processedServers: Server[] = [];

  for (const host of hostnames) {
    const server = ns.getServer(host);
    let nuked: boolean | undefined = undefined;

    if (!server.purchasedByPlayer && !server.hasAdminRights) {
      ns.brutessh(server.hostname);
      ns.ftpcrack(server.hostname);
      ns.relaysmtp(server.hostname);
      ns.httpworm(server.hostname);
      ns.sqlinject(server.hostname);
      if (ns.nuke(server.hostname)) nuked = true;
    }

    processedServers.push({
      cores: server.cpuCores,
      hasAdmin: nuked ?? server.hasAdminRights,
      maxRam: server.maxRam,
      ram: server.ramUsed,
      name: server.hostname,
      money: server.moneyAvailable ?? 0,
      maxMoney: server.moneyMax ?? 0,
      security: server.hackDifficulty ?? 0,
      minSecurity: server.minDifficulty ?? 0,
      isBackdoored: server.backdoorInstalled ?? false,
      isPlayerOwned: server.purchasedByPlayer,
    } satisfies Server);
  }

  ns.clearPort(SERVER_INFO_PORT);
  ns.writePort(SERVER_INFO_PORT, {
    servers: processedServers
  } satisfies ServerInfo);

  invokeNextScript(ns);
}
