import { DarknetServerDetails, NS } from "@ns";
import { HydraAction, HydraInstanceUpdate, HydraStatus } from "@repo/common/info/hydra";
import { getPortData, HYDRA_STATE_PORT, HYDRA_UPDATE_PORT } from "@repo/common/ports";
import { DarknetServer, RED, RESET } from "./types";
import { getCodebreaker } from "./codebreakers";

export const HYDRA_SCRIPT = "tasks/actionator/core/darknet/hydra.js";

const HYDRA_POLL_INTERVAL = 3000;

/*
  This script will run and be placed on every darknet server to run autonomously from within that server.
  It mainly is able to communicate with a centralized controller through netscript ports. The darknet servers
  are incongruent with our task allocation system, so instead of trying to adapt what we have, we'll aim to manage a
  self-contained controller on each individual darknet server. The controller will decide how to best use its
  available resources and communicate state centrally.
*/
class HydraTask {
  private readonly ns: NS;
  private readonly hostname: string;

  private state: HydraAction;
  private host: DarknetServerDetails;

  constructor(ns: NS) {
    this.ns = ns;
    this.state = "idle";
    this.host = ns.dnet.getServerDetails();
    this.hostname = ns.getHostname();
  }

  async run(): Promise<void> {
    while (true) {
      const state = getPortData<HydraStatus>(this.ns, HYDRA_STATE_PORT);
 
      // check for a kill-switch so we don't run after the main system is offline
      if (state === undefined) {
        this.ns.exit();
      }

      // send an update (ok, this is one frame old, who cares)
      this.sendUpdate();

      this.state = "idle";

      // if our active server has a cache, open it!
      const files = this.ns.ls(this.hostname, ".cache");
      if (files.length > 0) {
        for (const file of files) {
          this.ns.dnet.openCache(file);
        }
      }

      // look for opportunities to spread to our neighbors
      const neighbors = this.ns.dnet.probe().map(neighbor => ({...this.ns.dnet.getServerDetails(neighbor), hostname: neighbor}));
      try {
        for (const neighbor of neighbors) {
          await this.proliferate(neighbor);
        }
      } catch(e: any) {
        this.ns.tprint(`${RED}Error${RESET} during attempting proliferation: ${JSON.stringify(e)}`);
        continue;
      }
      
      // if our active server has available ram, we need to unleash it!
      if (this.host.blockedRam > 0) {
        this.state = "reclaiming-ram";
        await this.ns.dnet.memoryReallocation();
        continue;
      }

      await this.ns.asleep(HYDRA_POLL_INTERVAL);
    }
  }

  private async proliferate(neighbor: DarknetServer): Promise<void> {
    if (neighbor.hasSession) {
      this.infect(neighbor.hostname);
      return;
    }

    const codebreaker = getCodebreaker(neighbor, this.ns);
    if (await codebreaker.tryAuthenticate()) {
      this.infect(neighbor.hostname);
      return;
    }
   }

  private infect(target: string): void {
    if (this.ns.isRunning(HYDRA_SCRIPT, target)) return;

    const files = this.ns.ls(this.hostname, ".js");
    this.ns.scp(files, target);
          
    if (0 === this.ns.exec(HYDRA_SCRIPT, target, { temporary: true, preventDuplicates: true })) {
      this.ns.tprint(`${RED}Error${RESET} starting hydra script against ${target}.`);
    }
  }


  private sendUpdate(): void {
    this.host = this.ns.dnet.getServerDetails();

    this.ns.writePort(HYDRA_UPDATE_PORT, {
      depth: this.host.depth,
      hostname: this.ns.getHostname(),
      state: this.state,
      lastUpdate: Date.now()
    } satisfies HydraInstanceUpdate);
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  await new HydraTask(ns).run();
}
