import { NS } from "@ns";
import { createLogger } from "../log";

export async function main(ns: NS): Promise<void> {
  const logger = createLogger(ns, "pwn");
  const targetServer = ns.args[0].toString();

  ns.disableLog("ALL");

  // brute force all the port opening techniques
  ns.brutessh(targetServer);
  ns.ftpcrack(targetServer);
  ns.relaysmtp(targetServer);
  ns.httpworm(targetServer);
  ns.sqlinject(targetServer);

  if (ns.nuke(targetServer)) {
    logger.info(`${targetServer} nuked.`);
  } else {
    logger.warn(`Failed to nuke ${targetServer}.`);
  }

  // note - backdoors come from singularity API, separated out
}
