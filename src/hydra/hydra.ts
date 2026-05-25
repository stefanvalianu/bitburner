import { DarknetServerDetails, NS } from "@ns";
import { HydraControllerState } from "@repo/common/info/hydra";
import { getPortData, HYDRA_STATE_PORT } from "@repo/common/ports";
import { DarknetServer, HYDRA_SCRIPT, HydraIpPortState, PHISH_SCRIPT, RECLAIM_SCRIPT } from "./types";
import { ipv4ToUint32Fast } from "./helpers";
import { loot } from "./loot-helpers";
import { getCodebreaker } from "./codebreakers";
import { getMaxPossibleThreads } from "./thread-helper";

const INFECTING_STALENESS_LIMIT_MS = 1000 * 60 * 3; // 3 minutes

class Hydra {
  private readonly ns: NS;
  private readonly host: DarknetServer;

  constructor(ns: NS) {
    this.ns = ns;
    const ip = ns.getIP();

    this.host = {
      ...ns.dnet.getServerDetails(),
      ip,
    };
  }

  async run(): Promise<void> {
    // every mutation: broadcast our location/position to the home controller
    // TODO - we should keep some behavior state and compare it against HydraState to change our actions at the behest of the central controller. We'll have to scriptkill everything when changing
    let state = getPortData<HydraControllerState>(this.ns, HYDRA_STATE_PORT);

    // state being undefined is our kill-switch.;
    while (undefined !== state) {
      // at this point, we are in a new (to us) darknet cycle

      // Loot this server if we can
      loot(this.ns, this.host.ip);

      // Infect our neighbors (and build our neighbor map)
      await this.infectNeighbors();

      if (this.host.blockedRam > 0) {
        // kick off the reallocator script. it will eventually spawn into the phisher
        this.runScript(RECLAIM_SCRIPT, this.host.ip);
      } else {
        // go into phishing
        this.runScript(PHISH_SCRIPT, this.host.ip);
      }

      // this controller is done for now
      await this.ns.dnet.nextMutation();

      // check the state - should we be dead?
      state = getPortData<HydraControllerState>(this.ns, HYDRA_STATE_PORT);
    }
  }

  /*
    Build our map of neighbors, infect ones that need infecting, and update our neighbor map at the end.
    Note that this is running once per darknet cycle.
  */
  private async infectNeighbors(): Promise<void> {
    const neighborsIps = this.ns.dnet.probe(true);
    const playerCharisma = this.ns.getPlayer().skills.charisma;

    for (const neighborIp of neighborsIps) {
      const neighbor = this.ns.dnet.getServerDetails(neighborIp);

      // we're not going to try, our rizz is lacking
      if (neighbor.requiredCharismaSkill > playerCharisma) continue;

      // we probably took too long during authenticating, and the next iterator is no longer valid
      if (!neighbor.isConnectedToCurrentServer) continue;

      // we're already connected.
      if (neighbor.hasSession) continue;

      const neighborPort = ipv4ToUint32Fast(neighborIp);
      const neighborPortState = getPortData<HydraIpPortState>(this.ns, neighborPort);

      // If nobody has seen this IP before, stake a claim so others leave it alone
      if (neighborPortState === undefined) {
        this.ns.writePort(neighborPort, {
          ip: neighborIp,
          state: "infecting",
          infectingStart: Date.now(),
        } satisfies HydraIpPortState);

        await this.tryInfectNeighbor(neighborIp, neighbor);
        continue;
      }

      // Neighbors that are not online are gone forever
      if (!neighbor.isOnline) {
        if (neighborPortState) {
          this.ns.clearPort(neighborPort);
        }

        continue;
      }

      // Another hydra instance is attacking them, unless it died
      if (neighborPortState.state === "infecting") {
        if (neighborPortState.infectingStart && Date.now() > (neighborPortState.infectingStart + INFECTING_STALENESS_LIMIT_MS)) {
          this.ns.tprint(`Target ${neighborIp} is in 'infecting' state, but it seems to be stale. Taking over.`);

          this.ns.clearPort(neighborPort);
          this.ns.writePort(neighborPort, {
            ip: neighborIp,
            state: "infecting",
            infectingStart: Date.now(),
          } satisfies HydraIpPortState);

          await this.tryInfectNeighbor(neighborIp, neighbor);
          continue;
        } else {
          // someone is on it
          continue;
        }
      }

      if (neighborPortState.password === undefined) {
        this.ns.tprint(`Hydra neighbor ${neighborIp} in infected state, but no password stored.`);
        continue;
      }

      // Cool, in theory this server is known and connectable
      const connectionResult = this.ns.dnet.connectToSession(neighborIp, neighborPortState.password);

      if (connectionResult.success) {
        // kickstart the hydra script in case it's not already running
        this.spawnHydra(neighborIp);
      } else {
        // connection failed, this could be because the server is NEW but reusing an old IP. either way, the state is wrong
        this.ns.tprint(`Connecting to expected server ${neighborIp} with password ${neighborPortState.password} failed. Re-attacking.`);

        this.ns.clearPort(neighborPort);
        this.ns.writePort(neighborPort, {
          ip: neighborIp,
          state: "infecting",
          infectingStart: Date.now(),
        } satisfies HydraIpPortState);

        await this.tryInfectNeighbor(neighborIp, neighbor);
      }
    }
  }

  private async tryInfectNeighbor(targetIp: string, targetServer: DarknetServerDetails): Promise<void> {
    const codebreaker = getCodebreaker(targetServer, targetIp, this.ns);
    const result = await codebreaker.tryAuthenticate();

    if (result.result === "ok") {
      this.spawnHydra(targetIp);
    } else if (result.result === "impossible") {
      // Can't be solved. No point in poisoning the ip since we'll implement a solver soon
      this.ns.tprint(`Cannot solve ${targetServer.modelId}`);
      return;
    }
    else if (result.result === "transient") {
      // this should happen significantly less often
      this.ns.tprint(`Transient error trying to authenticate to ${targetServer.modelId}`);
    }
  }

  private spawnHydra(targetIp: string): void {
    // Spread files from us to them
    const files = this.ns.ls(this.host.ip, ".js");
    this.ns.scp(files, targetIp);
    this.ns.exec(HYDRA_SCRIPT, targetIp, { temporary: false, preventDuplicates: true });
  }

  private runScript(script: string, ip: string): void {
      const threads = getMaxPossibleThreads(this.ns, ip, this.host.blockedRam, script);

      if (threads > 0) {
        this.ns.exec(script, ip, { temporary: false, preventDuplicates: true, threads: threads });
      }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  // kill any children when we exit so machine is fully clean
  ns.atExit(() => killPossibleSubscripts(ns));

  await new Hydra(ns).run();
}

function killPossibleSubscripts(ns: NS): void {
  ns.scriptKill("hydra/scripts/phish.js");
  ns.scriptKill("hydra/scripts/loot.js");
  ns.scriptKill("hydra/scripts/reclaim.js");
}
