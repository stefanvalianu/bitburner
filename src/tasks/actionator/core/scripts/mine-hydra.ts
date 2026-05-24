import { NS } from "@ns";
import { getIdentifier, HydraInstanceUpdate, HydraServer, HydraStatus } from "@repo/common/info/hydra";
import { drainPortData, getPortData, HYDRA_STATE_PORT, HYDRA_UPDATE_PORT } from "@repo/common/ports";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";
import { HYDRA_SCRIPT } from "@repo/tasks/actionator/core/darknet/hydra";
import { bootstrapHydra } from "../darknet/bootstrap";

/*
  This script is responsible for:
  - Communicating instructions to the various darknet hydra scripts
  - Collecting information produced by the darknet hydra scripts
  - Kickstarting the hydra virus on the network

  TODO NOTE: this script does NOT persist its state (files found, passwords) to
  the local file system. This SHOULD be done as this info is useful, but
  we'll want the Singularity APIs first to better manage the timing of when
  to clear it.
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));

  // Cannot continue without darkscape navigator
  if (!ns.fileExists(ns.enums.ProgramName.darkscape, "home")) {
    return;
  }

  const data = getPortData<HydraStatus>(ns, HYDRA_STATE_PORT);

  // first run - spread hydra to darkweb
  if (data === undefined) {
    if (ns.getHostname() !== "home") {
      // this script is not spawned on home; so the following spread to darknet won't work.
      if(0 === ns.exec("tasks/actionator/core/darknet/homeBirth.js", "home", { temporary: true, preventDuplicates: true })) {
        ns.tprint("Failed to spawn hydra birth script on home.");
      };
    } else {
      await bootstrapHydra(ns);
    }
    
    return;
  }

  // remove offline servers from our current state. Offline servers are essentially deleted
  for (const server of data.servers.values()) {
    let remove: boolean = false;
    try {
      if (ns.dnet.getServerDetails(server.hostname).isOnline === false) {
        remove = true;
      }
    } catch { 
      remove = true;
    } finally {
      data.servers.delete(server.identity);
      data.uninfectableServers.delete(server.identity);
    }
  }

  // collect updates, apply them to the state, continue
  const updates = drainPortData<HydraInstanceUpdate>(ns, HYDRA_UPDATE_PORT) || [];
  for (const update of updates) {
    let hydraServer = data.servers.get(update.identity);

    switch (update.type) {
      case "action": {
        if (!hydraServer) {
          hydraServer = {
            action: update.action!,
            depth: update.depth!,
            healthy: true,
            identity: update.identity,
            hostname: update.hostname,
            lastUpdate: update.lastUpdate,
            password: update.password
          } satisfies HydraServer;
        } else {
          hydraServer.action = update.action!;
          hydraServer.depth = update.depth!;
          hydraServer.healthy = true;
          hydraServer.lastUpdate = update.lastUpdate;
        }

        data.servers.set(hydraServer.identity, hydraServer);
      } break;

      case "noteFound": {
        // TODO
      } break;

      case "uninfectable": {
        data.uninfectableServers.add(update.identity);
      } break;
    }
  }

  // TODO - figure out healthy status, deciding to remove servers, etc
  updateState(ns, data);
}

function updateState(ns: NS, state: HydraStatus): void {
  ns.clearPort(HYDRA_STATE_PORT);
  ns.writePort(HYDRA_STATE_PORT, state);
}
