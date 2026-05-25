import { NS } from "@ns";
import { HydraControllerState } from "@repo/common/info/hydra";
import { getPortData, HYDRA_STATE_PORT } from "@repo/common/ports";
import { bootstrapHydra } from "@repo/hydra/bootstrap";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

/*
  This script is responsible for:
  - Kickstarting the hydra virus on the network
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));

  // Cannot continue without darkscape navigator
  if (!ns.fileExists(ns.enums.ProgramName.darkscape, "home")) {
    return;
  }

  const data = getPortData<HydraControllerState>(ns, HYDRA_STATE_PORT);

  // first run - spread hydra to darkweb
  if (data === undefined) {
    if (ns.getHostname() !== "home") {
      // this script is not spawned on home; so the following spread to darknet won't work.
      if(0 === ns.exec("hydra/bootstrap-oneoff.js", "home", { temporary: true, preventDuplicates: true })) {
        ns.tprint("Failed to spawn hydra birth script on home.");
      };
    } else {
      await bootstrapHydra(ns);
    }
   
    ns.writePort(HYDRA_STATE_PORT, {
      up: true,
    } satisfies HydraControllerState);

    return;
  }
}
