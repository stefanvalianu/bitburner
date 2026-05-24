import { DarknetServerDetails, NS, Server } from "@ns";
import { HydraStatus } from "@repo/common/info/hydra";
import { getPortData, HYDRA_STATE_PORT } from "@repo/common/ports";
import { HYDRA_TO_SCRIPT, HydraCore } from "./hydra-core";

export const HYDRA_SCRIPT = "tasks/actionator/core/darknet/hydra.js";

interface Neighbor {
  darknetServer: DarknetServerDetails,
  server: Server,
  identity: string,
};

/*
  This script will run and be placed on every darknet server to run autonomously from within that server.
  It mainly is able to communicate with a centralized controller through netscript ports. The darknet servers
  are incongruent with our task allocation system, so instead of trying to adapt what we have, we'll aim to manage a
  self-contained controller on each individual darknet server. The controller will decide how to best use its
  available resources and communicate state centrally.

  Note that calling thread-positive scripts like heartbleed or phishingAttack will maximize thread usage by spawning
  (killing this host, running, then spawning back). This will enable maximal RAM usage on otherwise limited hardware.
*/
class HydraTask extends HydraCore {
  constructor(ns: NS) {
    super(ns);
  }

  async run(): Promise<void> {
    const state = getPortData<HydraStatus>(this.ns, HYDRA_STATE_PORT);

    // check for a kill-switch so we don't run after the main system is offline
    if (state === undefined) {
      this.ns.exit();
    }

    // P0: if our active server has a cache, open it!
    const files = this.ns.ls(this.host.hostname, ".cache");
    if (files.length > 0) {
      for (const file of files) {
        this.ns.dnet.openCache(file);
      }
    }

    // P1: if we have spare files sitting around, identify them and send them to the controller
    // TODO

    // P2: if we have un-infected neighbors, spawn as a proliferator
    const target = this.identify_infectable_neighbor(state);
    if (target) {
      this.respawn("proliferate", target);
      return;
    }

    // P3: if we have un-claimed RAM, spawn as a reclaimer
    if (this.host.blockedRam > 0) {
      this.respawn("reclaim");
    }

    // P4: spawn as a phisher
    this.respawn("phish");
  }
/*
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

    const files = this.ns.ls(this.host.hostname, ".js");
    this.ns.scp(files, target);
          
    if (0 === this.ns.exec(HYDRA_SCRIPT, target, { temporary: true, preventDuplicates: true })) {
      this.ns.tprint(`${RED}Error${RESET} starting hydra script against ${target}.`);
    }
  }*/

  /*
    TODO: can we run singularity backdoor() functions on servers to avoid needing neighhbor-exec

    This function is responsible for identifying a potentially hackable neighbor server. It is ALSO
    responsible for copying hydra scripts and execing() them on a neighbor if we're not spread already,
    using the existing catalog of identities->passwords to establish a session to do so.

  */
  private identify_infectable_neighbor(state: HydraStatus): string | undefined {
    const neighbors = this.ns.dnet.probe().map(n => {
      const darknet = this.ns.dnet.getServerDetails(n);
      const normal = this.ns.getServer(n);

      return {
        darknetServer: darknet,
        server: normal,
        identity: this.getIdentifier(normal.hostname, normal.ip, darknet.modelId),
      } satisfies Neighbor
    }).filter(n => n.darknetServer.isOnline);

    // Go through all servers, execing when necessary and identifying an infectable target
    let infectable: string | undefined = undefined;

    for (const neighbor of neighbors) {
      if (neighbor.darknetServer.hasSession) continue;

      const hydraServer = state.servers.get(neighbor.identity);

      if (hydraServer === undefined || hydraServer.password === undefined) {
        // we've either never seen this server before, or we have but failed to crack it
      }
      else {
        // this is something we should be able to solve (unless somehow password expired?)
        const result = this.ns.dnet.connectToSession(neighbor.server.hostname, hydraServer.password);
        if (result.success) {
          if (!this.getIsRunningHydraScript(neighbor.server.hostname)) {
            // server isn't running a hydra script, let's fix that
            this.ns.exec(HYDRA_SCRIPT, neighbor.server.hostname, { preventDuplicates: true, temporary: false });
          }
        } else {
          this.ns.tprint(`Unexpected; tried to connect to known identity ${hydraServer.identity} with password ${hydraServer.password} but failed.`);
        }
      }
    }
    
    return infectable;
  }

  private getIsRunningHydraScript(target: string): boolean {
    return Object.values(HYDRA_TO_SCRIPT).find(script => this.ns.scriptRunning(script)) !== undefined;
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  await new HydraTask(ns).run();
}
