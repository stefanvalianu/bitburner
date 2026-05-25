import { NS } from "@ns";
import { HYDRA_SCRIPT, HydraIpPortState } from "./types";
import { ipv4ToUint32Fast } from "./helpers";

export async function bootstrapHydra(ns: NS): Promise<void> {
  // we need to crack the first server and deploy hydra to it
  const targets = ns.dnet.probe(true);

  if (targets.length === 1) {
    const host = targets[0];
    const result = await ns.dnet.authenticate(host, "");

    // note the 'darkweb' server is actually not being inserted by its identity, which is OK since we explicitly disallow traversing to it in the proliferfator.
    if (result.success) {
      const port = ipv4ToUint32Fast(host);
      ns.writePort(port, {
        ip: host,
        state: "infected",
        password: ""
      } satisfies HydraIpPortState);

      copyFilesAndStart(ns, host);
    } else {
      ns.tprint(`Failed to authenticate to first server: ${JSON.stringify(result)}`);
    }
  } else {
    ns.tprint(`Unexpected results from ns.dnet.probe: ${targets.join(",")}`);
  }
}

export function copyFilesAndStart(ns: NS, host: string): void {
  const files = ns.ls("home", ".js");
  ns.scp(files, host, "home");
  if (0 === ns.exec(HYDRA_SCRIPT, host, { temporary: false, preventDuplicates: true })) {
    ns.tprint(`Failed to start ${HYDRA_SCRIPT} on ${host}`);
  }
}
