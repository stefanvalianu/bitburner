import { NS } from "@ns";
import { getIdentifier, HydraStatus } from "@repo/common/info/hydra";
import { getPortData, HYDRA_STATE_PORT } from "@repo/common/ports";
import { HydraCore } from "./hydra-core";
import { getCodebreaker } from "./codebreakers";
import { DarknetServer } from "./types";
import { HYDRA_SCRIPT } from "./hydra";

/*
  This script is a version of the hydra ran on a host with the intention of infecting
  a neighbor. The neighbor hostname is passed in as an argument to this script's runtime.
*/
class ProliferateHydra extends HydraCore {
  private readonly target: DarknetServer;

  constructor(ns: NS) {
    super(ns);

    const targetHostname = ns.args[0] as string;
    const targetDarknet = ns.dnet.getServerDetails(targetHostname);
    const targetNormal = ns.getServer(targetHostname);

    this.target = {
      ...targetDarknet,
      ip: targetNormal.ip,
      hostname: targetHostname,
      identity: getIdentifier(targetHostname, targetNormal.ip, targetDarknet.modelId),
    }
  }

  async run(): Promise<void> {
    this.sendUpdate({
      type: "action",
      action: "proliferating",
      depth: this.host.depth,
      identity: this.host.identity,
      lastUpdate: Date.now(),
    });

    // TODO - we will likely need the state to solve some passwords later on for fancier solvers
    const _state = getPortData<HydraStatus>(this.ns, HYDRA_STATE_PORT);

    const codebreaker = getCodebreaker(this.target, this.ns);
    const result = await codebreaker.tryAuthenticate();

    if (result.result === "ok") {
      this.sendUpdate({
        type: "action",
        identity: this.target.identity,
        password: result.password,
        lastUpdate: Date.now(),
        action: "none",
        depth: this.target.depth,
      });

      this.spread();
    } else if (result.result === "impossible") {
      // We're lacking the appropriate solver, no point in trying again
      this.sendUpdate({
        type: "uninfectable",
        identity: this.target.identity,
        lastUpdate: Date.now(),
      });
    }

    // temp failed results can be re-tried (TODO note this might lead to a short-term loop...)

    // always respawn as a main hydra
    this.respawn("main");
  }

  private spread(): void {
    const files = this.ns.ls(this.host.hostname, ".js");
    this.ns.scp(files, this.target.hostname);

    // FYI, multiple scripts can try to exec something; it's possible for this to fail
    this.ns.exec(HYDRA_SCRIPT, this.target.hostname, { temporary: false, preventDuplicates: true });
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  await new ProliferateHydra(ns).run();
}
