import { NS } from "@ns";
import { DarknetServer } from "./types";
import { HYDRA_SCRIPT } from "./hydra";
import { HydraInstanceUpdate } from "@repo/common/info/hydra";
import { HYDRA_UPDATE_PORT } from "@repo/common/ports";

type Hydra = "main" | "phish" | "proliferate" | "reclaim";

export const HYDRA_TO_SCRIPT: Record<Hydra, string> = {
  "main": HYDRA_SCRIPT,
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
      identity: this.getIdentifier(hostname, ip, server.modelId),
    }
  }

  protected getIdentifier(hostname: string, ip: string, modelId: string): string {
    return `${hostname}-${ip}-${modelId}`;
  }

  /*
    Respawns the current hydra with a new one. Be aware that
    each sub-hydra should always respawn back into the main hydra to allow
    the main hydra to allow centralized communications/planning, etc.
  */
  protected respawn(hydra: Hydra, arg?: string): void {
    const scriptPath = HYDRA_TO_SCRIPT[hydra];
    const scriptRam = this.ns.getScriptRam(scriptPath);
    const maxRam = this.ns.getServerMaxRam();

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
