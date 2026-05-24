import { NS } from "@ns";
import { DarknetServer } from "./types";
import { getIdentifier, HydraInstanceUpdate } from "@repo/common/info/hydra";
import { HYDRA_UPDATE_PORT } from "@repo/common/ports";

type Hydra = "main" | "phish" | "proliferate" | "reclaim";

export const HYDRA_TO_SCRIPT: Record<Hydra, string> = {
  "main": "tasks/actionator/core/darknet/hydra.js",
  "phish": "tasks/actionator/core/darknet/hydra-phish.js",
  "proliferate": "tasks/actionator/core/darknet/hydra-proliferate.js",
  "reclaim": "tasks/actionator/core/darknet/hydra-reclaim.js"
};

export abstract class HydraCore {
  protected readonly ns: NS;
  protected readonly host: DarknetServer;

  constructor(ns: NS) {
    this.ns = ns;

    const server = ns.dnet.getServerDetails();
    const hostname = ns.getHostname();
    const ip = ns.getIP();

    this.host = {
      ...server,
      hostname,
      ip,
      identity: getIdentifier(hostname, ip, server.modelId),
    }
  }

  /*
    Respawns the current hydra with a new one. Be aware that
    each sub-hydra should always respawn back into the main hydra to allow
    the main hydra to allow centralized communications/planning, etc.
  */
  protected respawn(hydra: Hydra, arg?: string): void {
    const scriptPath = HYDRA_TO_SCRIPT[hydra];
    const scriptRam = this.ns.getScriptRam(scriptPath);
    const maxRam = this.ns.getServerMaxRam() - this.host.blockedRam;

    this.ns.spawn(scriptPath, { spawnDelay: 0, threads: Math.floor(maxRam / scriptRam), temporary: false, preventDuplicates: true }, arg ?? 0);
  }

  /*
    Use this to send information to the main controller to help coordinate
    across all the different hydras.
  */
  protected sendUpdate(update: HydraInstanceUpdate): void {
    this.ns.writePort(HYDRA_UPDATE_PORT, update);
  }
}
