import { NS } from "@ns";
import { HydraControllerState } from "@repo/common/info/hydra";
import { getPortData, HYDRA_STASIS_CLAIM_PORT, HYDRA_STATE_PORT } from "@repo/common/ports";
import { AUTH_SCRIPT, DarknetServer, HydraAuthInfo, HydraIpPortState, PHISH_SCRIPT, RECLAIM_SCRIPT, STASIS_SCRIPT } from "./types";
import { ipv4ToUint32Fast } from "./helpers";
import { getMaxPossibleThreads } from "./thread-helper";
import { spawnHydra } from "./infect-helper";
import { loot } from "./loot-helper";

const INFECTING_STALENESS_LIMIT_MS = 1000 * 60 * 2; // 2 minutes

interface NeighborInfo {
  server: DarknetServer;
  port: number;
}

class Hydra {
  private readonly ns: NS;

  private host: DarknetServer;
  private authenticatorPid?: number;
  private stasisPid?: number;

  constructor(ns: NS) {
    this.ns = ns;

    this.host = {
      ...ns.dnet.getServerDetails(),
      ip: ns.getIP(),
    };
  }

  async start(): Promise<void> {

    // every mutation: broadcast our location/position to the home controller
    // TODO - we should keep some behavior state and compare it against HydraState to change our actions at the behest of the central controller. We'll have to scriptkill everything when changing
    let state = getPortData<HydraControllerState>(this.ns, HYDRA_STATE_PORT);

    // state being undefined is our kill-switch.;
    while (undefined !== state) {
      // at this point, we are in a new (to us) darknet cycle
      loot(this.ns, this.host.ip, false);
      
      this.host = {
        ...this.host,
        ...this.ns.dnet.getServerDetails(),
      }

      if (this.authenticatorPid && !this.ns.isRunning(this.authenticatorPid)) {
        // auhenticator finished, sweet
        this.authenticatorPid = undefined;
      }

      if (this.stasisPid) {
        // stasis is the most important thing we could be doing
        if (!this.ns.isRunning(this.stasisPid)) {
          // sweet, we're done
          this.stasisPid = undefined;
        } else {
          // don't do anything else, just keep waiting for this script to end
          await this.ns.dnet.nextMutation();
          continue;
        }
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

    // stationary servers are already stasised, also prevent us from getting in a stasis loop
    if (!this.host.isStationary && !state.stasisLinkedIps.includes(this.host.ip)) {
      // URGENT: if we identify a Labyrinth and stasis is still needed, do that right away
      if (!state.haveLabyrinthStasis &&
          undefined !== neighbors.find(s => s.modelId === "(The Labyrinth)") &&
          getMaxPossibleThreads(this.ns, this.host.ip, this.host.blockedRam, STASIS_SCRIPT) > 0) {
        // we don't want to add the RAM cost for spawn(), and we can't atExit(() => exec()) as it's too unreliable.
        this.ns.killall(undefined, true);
        const stasisProcess = this.ns.exec(STASIS_SCRIPT, this.host.ip, undefined, this.host.ip, true);
        if (0 !== stasisProcess) {
          this.stasisPid = stasisProcess;
          this.ns.toast("Labyrinth found, entering stasis...", "info")
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
          const stasisProcess = this.ns.exec(STASIS_SCRIPT, this.host.ip, undefined, this.host.ip, false);
          if (0 === stasisProcess) {
            this.ns.clearPort(HYDRA_STASIS_CLAIM_PORT);
          } else {
            this.stasisPid = stasisProcess;
            this.ns.toast(`Reached depth ${this.host.depth}, entering stasis...`, "info");
          }
          return [];
        }
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

      /*
        Another hydra instance is attacking them, unless it died
        NOTE we no longer use this. While it's wasteful to perform multiple attacks
        on a single target, we don't have determinism on which 'hydra' can best attack
        something, and artificially restricting the ability for a hydra which might be
        neighbors for longer NOT start cracking a password is not great
      */
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
      } else if (connectionResult.code === 401 || connectionResult.code === 403) {
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
        if (this.authenticatorPid === 0) {
          this.ns.tprint(`Failed to start authenticator script on ${this.host.ip} despite needing to authenticate to neighbors.`);
        }
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
