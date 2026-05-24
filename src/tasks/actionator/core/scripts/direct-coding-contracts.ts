import { NS } from "@ns";
import { crawlServers } from "@repo/common/crawlServers";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";
import { solve } from "@repo/tasks/actionator/core/contractSolvers";

/*
  This script is responsible for:
  - Searching for and solving coding contracts
*/

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));
  
  const servers = crawlServers(ns);
  for (const server of servers) {
    const contracts = ns.ls(server.hostname, ".cct");

    for (const cct of contracts) {
      const contract = ns.codingcontract.getContract(cct, server.hostname);
      solve(ns, contract);
    }
  }
}
