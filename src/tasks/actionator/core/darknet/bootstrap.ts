import { NS } from "@ns";
import { getIdentifier, HydraServer } from "@repo/common/info/hydra";
import { HYDRA_SCRIPT } from "./hydra";
import { HYDRA_STATE_PORT } from "@repo/common/ports";

export async function bootstrapHydra(ns: NS): Promise<void> {
  // we need to crack the first server and deploy hydra to it
  const targets = ns.dnet.probe();

  if (targets.length === 1) {
    const host = targets[0];
    const result = await ns.dnet.authenticate(host, "");

    const identity = getIdentifier(host, ns.getServer(host).ip, ns.dnet.getServerDetails(host).modelId);

    // note the 'darkweb' server is actually not being inserted by its identity, which is OK since we explicitly disallow traversing to it in the proliferfator.
    if (result.success) {
      ns.clearPort(HYDRA_STATE_PORT);
      ns.writePort(HYDRA_STATE_PORT, {
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
      if (0 === ns.exec(HYDRA_SCRIPT, host, { temporary: false, preventDuplicates: true })) {
        ns.tprint(`Failed to start ${HYDRA_SCRIPT} on ${host}`);
      }
    } else {
      ns.tprint(`Failed to authenticate to first server: ${JSON.stringify(result)}`);
    }
  } else {
    ns.tprint(`Unexpected results from ns.dnet.probe: ${targets.join(",")}`);
  }
}
