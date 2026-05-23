import { DarknetServerDetails, NS } from "@ns";
import { HydraAction, HydraInstanceUpdate, HydraStatus } from "@repo/common/info/hydra";
import { getPortData, HYDRA_STATE_PORT, HYDRA_UPDATE_PORT } from "@repo/common/ports";

export const HYDRA_SCRIPT = "tasks/actionator/core/darknet/hydra.js";

const HYDRA_POLL_INTERVAL = 3000;

const cyan = "\u001b[36m";
const red = "\u001b[31m";
const reset = "\u001b[0m";

interface DarknetServer extends DarknetServerDetails {
  hostname: string;
}

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
      } catch(e) {
        this.ns.tprint(`${red}Error${reset} during attempting proliferation: ${e}`);
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
    if (neighbor.hasSession && !this.ns.isRunning(HYDRA_SCRIPT, neighbor.hostname)) {
      this.infect(neighbor.hostname);
      return;
    }

    const password = this.getPasswordForModel(neighbor);

    const result = await this.ns.dnet.authenticate(neighbor.hostname, password);

    if (result.success) {
      this.infect(neighbor.hostname);
    } else {
      //this.ns.tprint(`${red}Failed${reset} to authenticate against ${neighbor.hostname} of type ${neighbor.modelId}. Details: ${cyan}${JSON.stringify(result)}${reset}`);
    }
  }

  private infect(target: string): void {
    const files = this.ns.ls(this.hostname, ".js");
    this.ns.scp(files, target);
          
    if (0 === this.ns.exec(HYDRA_SCRIPT, target, { temporary: true, preventDuplicates: true })) {
      this.ns.tprint(`${red}Error${reset} starting hydra script against ${target}.`);
    }
  }

  private getPasswordForModel(target: DarknetServer): string {
    switch (target.modelId) {
      case "ZeroLogon":
        return "";

      //case "FreshInstall_1.0":

      default: 
        this.ns.tprint(`${cyan}${target.modelId}${reset}: data ${target.data}, pwlen ${target.passwordLength}, pwformat ${target.passwordFormat}, pwhint ${red}${target.passwordHint}${reset}`);
        //this.ns.tprint(`Unexpected modelId encountered: ${red}${target.modelId}${reset}`);
        return "";
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
