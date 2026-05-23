import { NS } from "@ns";
import { HydraInstanceUpdate, HydraServer, HydraStatus } from "@repo/common/info/hydra";
import { drainPortData, getPortData, HYDRA_STATE_PORT, HYDRA_UPDATE_PORT } from "@repo/common/ports";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";
import { HYDRA_SCRIPT } from "@repo/tasks/actionator/core/darknet/hydra";

/*
  This script is responsible for:
  - Communicating instructions to the various darknet hydra scripts
  - Collecting information produced by the darknet hydra scripts
  - Kickstarting the hydra bug on the network
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

      if (result.success) {
        updateState(ns, {
          servers: new Map([[host, {hostname: host, depth: -1, state: "idle", lastUpdate: Date.now()} satisfies HydraServer]]),
        });

        // scp all files
        const files = ns.ls("home", ".js");
        ns.scp(files, host, "home");
              
        if (0 === ns.exec(HYDRA_SCRIPT, host, { temporary: true })) {
          ns.tprint(`Error starting hydra script.`);
        }
      } else {
        ns.tprint(`Failed to authenticate to first server: ${JSON.stringify(result)}`);
      }
    } else {
      ns.tprint(`Unexpected results from ns.dnet.probe: ${targets.join(",")}`);
    }

    return;
  }

  // collect updates, apply them to the state, continue
  const updates = drainPortData<HydraInstanceUpdate>(ns, HYDRA_UPDATE_PORT) || [];
  for (const update of updates) {
    // TODO - this will change if the update only contains partial stuff, which it might grow to do
    data.servers.set(update.hostname, {
      depth: update.depth,
      hostname: update.hostname,
      state: update.state,
      lastUpdate: update.lastUpdate,
    });
  }
}

function updateState(ns: NS, state: HydraStatus): void {
  ns.writePort(HYDRA_STATE_PORT, state);
}
