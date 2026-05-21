import { NS } from "@ns";
import { invokeNextScript } from "./helpers";
import { SERVER_INFO_PORT } from "@repo/common/ports";
import { Server, ServerInfo } from "@repo/common/info/serverInfo";
import { crawlServers } from "@repo/common/crawlServers";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  const servers = crawlServers(ns);

  ns.clearPort(SERVER_INFO_PORT);
  ns.writePort(SERVER_INFO_PORT, {
    servers: servers.map(s => ({
      cores: s.cpuCores,
      hasAdmin: s.hasAdminRights,
      maxRam: s.maxRam,
      ram: s.ramUsed,
      name: s.hostname
    } satisfies Server))
  } satisfies ServerInfo);

  invokeNextScript(ns);
}
