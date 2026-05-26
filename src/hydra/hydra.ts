import { NS } from "@ns";
import { HydraControllerState } from "@repo/common/info/hydra";
import { getPortData, HYDRA_STASIS_CLAIM_PORT, HYDRA_STATE_PORT } from "@repo/common/ports";
import { AUTH_SCRIPT, CYAN, DarknetServer, HydraAuthInfo, HydraIpPortState, LOOT_SCRIPT, PHISH_SCRIPT, RECLAIM_SCRIPT, RESET, STASIS_SCRIPT } from "./types";
import { ipv4ToUint32Fast } from "./helpers";
import { getMaxPossibleThreads } from "./thread-helper";
import { spawnHydra } from "./infect-helper";

const INFECTING_STALENESS_LIMIT_MS = 1000 * 60 * 2; // 2 minutes

interface NeighborInfo {
  server: DarknetServer;
  port: number;
}

class Hydra {
  private readonly ns: NS;

  private host: DarknetServer;
  private authenticatorPid?: number;

  constructor(ns: NS) {
    this.ns = ns;

    this.host = {
      ...ns.dnet.getServerDetails(),
      ip: ns.getIP(),
    };

    // exec a loot script to open any caches/share any files when we start on the server
    ns.exec(LOOT_SCRIPT, this.host.ip, { temporary: true, preventDuplicates: true }, this.host.ip, false);
  }

  async start(): Promise<void> {
    
    // wait a bit for the loot script to do its thing, we don't want to kill it from authentication.
    await this.ns.asleep(500);

    // every mutation: broadcast our location/position to the home controller
    // TODO - we should keep some behavior state and compare it against HydraState to change our actions at the behest of the central controller. We'll have to scriptkill everything when changing
    let state = getPortData<HydraControllerState>(this.ns, HYDRA_STATE_PORT);

    // state being undefined is our kill-switch.;
    while (undefined !== state) {
      // at this point, we are in a new (to us) darknet cycle
      this.host = {
        ...this.host,
        ...this.ns.dnet.getServerDetails(),
      }

      if (this.authenticatorPid && !this.ns.isRunning(this.authenticatorPid)) {
        // auhenticator finished, sweet
        this.authenticatorPid = undefined;
      }
      
      // Infect our neighbors (and build our neighbor map)
      const neighborsNeedingHelp = await this.infectNeighbors(state);

      // all our RAM is in use
      if (!this.authenticatorPid) {
        if (this.host.blockedRam > 0) {
          // kick off the reallocator script. it will eventually spawn into the phisher
          const threads = getMaxPossibleThreads(this.ns, this.host.ip, this.host.blockedRam, RECLAIM_SCRIPT);
          if (threads > 0) {
            this.ns.exec(RECLAIM_SCRIPT, this.host.ip, { temporary: false, preventDuplicates: true, threads: threads }, this.host.ip, true);
          }
        } else if (neighborsNeedingHelp.length > 0) {
          if (this.ns.isRunning(PHISH_SCRIPT, this.host.ip)) {
            // if we were phishing, we need to help instead
            this.ns.killall(undefined, true);
          }
          // help a neighbor reclaim
          const threads = getMaxPossibleThreads(this.ns, this.host.ip, this.host.blockedRam, RECLAIM_SCRIPT);
          if (threads > 0) {
            this.ns.exec(RECLAIM_SCRIPT, this.host.ip, { temporary: false, preventDuplicates: true, threads: threads }, neighborsNeedingHelp[0].ip, false);
          }
        }
        else {
          // go into phishing
          const threads = getMaxPossibleThreads(this.ns, this.host.ip, this.host.blockedRam, PHISH_SCRIPT);
          if (threads > 0) {
            this.ns.exec(PHISH_SCRIPT, this.host.ip, { temporary: false, preventDuplicates: true, threads: threads });
          }
        }
      }

      // this controller is done for now
      await this.ns.dnet.nextMutation();

      // check the state - should we be dead?
      state = getPortData<HydraControllerState>(this.ns, HYDRA_STATE_PORT);
    }
  }

  /*
    Build our map of neighbors, infect ones that need infecting, and update our neighbor map at the end.
    Note that this is running once per darknet cycle. Also, since authenticating can take a while, do that last.
  */
  private async infectNeighbors(state: HydraControllerState): Promise<DarknetServer[]> {
    const neighborsIps = this.ns.dnet.probe(true);

    const neighbors = neighborsIps.map(ip => ({
      ip,
      ...this.ns.dnet.getServerDetails(ip),
    } satisfies DarknetServer));

    // URGENT: if we identify a Labyrinth and stasis is still needed, do that right away
    if (!state.haveLabyrinthStasis &&
        undefined !== neighbors.find(s => s.modelId === "(The Labyrinth)") &&
        getMaxPossibleThreads(this.ns, this.host.ip, this.host.blockedRam, STASIS_SCRIPT) > 0) {
      // we don't want to add the RAM cost for spawn(), and we can't atExit(() => exec()) as it's too unreliable.
      this.ns.killall(undefined, true);
      if (0 !== this.ns.exec(STASIS_SCRIPT, this.host.ip, undefined, true)) {
        this.ns.tprint(`${CYAN}Stasis Needed and Labyrinth Found!${RESET}`);
      }
      return [];
    }

    // ALSO URGENT: if we reached a depth that needs a link, let's link
    if (this.host.depth >= state.nextStasisMinDepth &&
        this.ns.getScriptRam(STASIS_SCRIPT) &&
        getMaxPossibleThreads(this.ns, this.host.ip, this.host.blockedRam, STASIS_SCRIPT) > 0) {
      const lock = getPortData<boolean>(this.ns, HYDRA_STASIS_CLAIM_PORT);
      if (!lock) {
        this.ns.writePort(HYDRA_STASIS_CLAIM_PORT, true);
        this.ns.killall(undefined, true);
        if (0 === this.ns.exec(STASIS_SCRIPT, this.host.ip, undefined, false)) {
          this.ns.clearPort(HYDRA_STASIS_CLAIM_PORT);
        } else {
          this.ns.tprint(`${CYAN}Stasis Link Needed and Depth Reached!${RESET}`);
        }
        return [];
      }
    }

    let targetsNeedingAuthentication: NeighborInfo[] = [];
    let neighborsNeedingReclaimingHelp: DarknetServer[] = [];

    for (const neighbor of neighbors) {
      // we're not going to try, our rizz is lacking
      if (neighbor.requiredCharismaSkill > state.playerCharisma) continue;

      // we probably took too long during authenticating, and the next iterator is no longer valid
      if (!neighbor.isConnectedToCurrentServer) continue;

      // see if the neighbor needs help; if they do, we prioritize that over our tasks
      if (neighbor.blockedRam > 0) {
        neighborsNeedingReclaimingHelp.push(neighbor);
      }

      // we're already connected.
      if (neighbor.hasSession) continue;

      const neighborPort = ipv4ToUint32Fast(neighbor.ip);
      const neighborPortState = getPortData<HydraIpPortState>(this.ns, neighborPort);

      // If nobody has seen this IP before, stake a claim so others leave it alone
      if (neighborPortState === undefined) {
        targetsNeedingAuthentication.push({ server: neighbor, port: neighborPort });
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
          this.ns.tprint(`Target ${neighbor.ip} is in 'infecting' state, but it seems to be stale. Taking over.`);
          targetsNeedingAuthentication.push({ server: neighbor, port: neighborPort });
          continue;
        } else {
          // someone is on it
          continue;
        }
      }

      if (neighborPortState.password === undefined) {
        this.ns.tprint(`Hydra neighbor ${neighbor.ip} in infected state, but no password stored.`);
        continue;
      }

      // Cool, in theory this server is known and connectable
      const connectionResult = this.ns.dnet.connectToSession(neighbor.ip, neighborPortState.password);

      if (connectionResult.success) {
        // kickstart the hydra script in case it's not already running
        spawnHydra(this.ns, neighbor.ip);
      } else {
        // connection failed, this could be because the server is NEW but reusing an old IP. either way, the state is wrong
        this.ns.tprint(`Connecting to expected server ${neighbor.ip} with password ${neighborPortState.password} failed. Re-attacking.`);
        targetsNeedingAuthentication.push({ server: neighbor, port: neighborPort });
      }
    }

    /*
      There's potential waste happening here. Either we clobber an old session if we reach
      this point before it finished (if it didn't end, it means it's still actively authenticating).
      Or, we don't, and we skip this waiting for the prior auth to finish. In the latter case, we'll
      block until the next move, potentially sitting on new targets that might move by the NEXT 
      migration. One strategy could be to write our target payloads to a file and have the auth
      script be more responsive to it, but for now let's acknowledge the inefficiency and continue.
    */
    if (!this.authenticatorPid && targetsNeedingAuthentication.length > 0) {
      let data = targetsNeedingAuthentication.map(t => ({
        sourceIp: this.host.ip,
        targetIp: t.server.ip,
        targetPort: t.port,
        targetModel: t.server.modelId,
        targetPasswordHint: t.server.passwordHint,
        targetPasswordData: t.server.data,
        targetPasswordLength: t.server.passwordLength,
        targetPasswordDifficulty: t.server.difficulty,
        targetPasswordFormat: t.server.passwordFormat,
      } satisfies HydraAuthInfo));

      // We've solved the low hanging fruits (propagated to known servers), now authenticate. This
      // takes priorities over other scripts.
      this.ns.killall(undefined, true);          
      const threads = getMaxPossibleThreads(this.ns, this.host.ip, this.host.blockedRam, AUTH_SCRIPT);
      if (threads > 0) {
        this.authenticatorPid = this.ns.exec(AUTH_SCRIPT, this.host.ip, { temporary: false, preventDuplicates: true, threads: threads }, JSON.stringify(data));
      }
      return [];
    }

    return neighborsNeedingReclaimingHelp;
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  // kill any children when we exit so machine is fully clean
  ns.atExit(() => ns.killall(undefined, true));

  await new Hydra(ns).start();
}
