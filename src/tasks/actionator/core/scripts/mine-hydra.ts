import { NS } from "@ns";
import { HydraServer, HydraStatus } from "@repo/common/info/hydra";
import { getPortData, HYDRA_STATE_PORT } from "@repo/common/ports";
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

  // Cannot continue without darkscape navigator
  if (!ns.fileExists(ns.enums.ProgramName.darkscape, "home")) {
    invokeNextScript(ns);
    return;
  }

  const data = getPortData<HydraStatus>(ns, HYDRA_STATE_PORT);

  if (data === undefined || data.servers.size === 0) {
    // we need to crack the first server and deploy hydra to it
    const targets = ns.dnet.probe();

    if (targets.length === 1) {
      const host = targets[0];
      const result = await ns.dnet.authenticate(host, "");

      if (result.success) {
        updateState(ns, {
          servers: new Map([[host, {hostname: host} satisfies HydraServer]]),
        });

        // scp all files
        const files = ns.ls("home", ".js");
        ns.scp(files, host, "home");
              
        if (0 === ns.exec(HYDRA_SCRIPT, host)) {
          ns.tprint(`Error starting hydra script.`);
        }
      } else {
        ns.tprint(`Failed to authenticate to first server: ${JSON.stringify(result)}`);
      }
    } else {
      ns.tprint(`Unexpected results from ns.dnet.probe: ${targets.join(",")}`);
    }

    invokeNextScript(ns);
    return;
  }

  invokeNextScript(ns);
}

function updateState(ns: NS, state: HydraStatus): void {
  ns.writePort(HYDRA_STATE_PORT, state);
}
