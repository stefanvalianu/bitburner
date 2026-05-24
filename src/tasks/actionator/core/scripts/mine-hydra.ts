import { NS } from "@ns";
import { getIdentifier, HydraInstanceUpdate, HydraServer, HydraStatus } from "@repo/common/info/hydra";
import { drainPortData, getPortData, HYDRA_STATE_PORT, HYDRA_UPDATE_PORT } from "@repo/common/ports";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";
import { HYDRA_SCRIPT } from "@repo/tasks/actionator/core/darknet/hydra";

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
  if (data === undefined || data.servers.size === 0) {
    // we need to crack the first server and deploy hydra to it
    const targets = ns.dnet.probe();

    if (targets.length === 1) {
      const host = targets[0];
      const result = await ns.dnet.authenticate(host, "");

      const identity = getIdentifier(host, ns.getServer(host).ip, ns.dnet.getServerDetails(host).modelId);

      // note the 'darkweb' server is actually not being inserted by its identity, which is OK since we explicitly disallow traversing to it in the proliferfator.
      if (result.success) {
        updateState(ns, {
          notesFound: new Map(),
          uninfectableServers: new Set(),
          servers: new Map(
            [
              [identity, {
                depth: -1,
                lastUpdate: Date.now(),
                action: "none",
                healthy: true,
                password: "",
                identity: identity,
                hostname: host,
              } satisfies HydraServer]
            ])
        });

        // scp all files
        const files = ns.ls("home", ".js");
        ns.scp(files, host, "home");
        ns.exec(HYDRA_SCRIPT, host, { temporary: false, preventDuplicates: true });
      } else {
        ns.tprint(`Failed to authenticate to first server: ${JSON.stringify(result)}`);
      }
    } else {
      ns.tprint(`Unexpected results from ns.dnet.probe: ${targets.join(",")}`);
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
