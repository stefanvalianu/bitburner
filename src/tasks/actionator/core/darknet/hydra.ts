import { NS } from "@ns";
import { HydraStatus } from "@repo/common/info/hydra";
import { getPortData, HYDRA_STATE_PORT } from "@repo/common/ports";

export const HYDRA_SCRIPT = "tasks/actionator/core/darknet/hydra.js";

const HYDRA_POLL_INTERVAL = 3000;

/*
  This script will run and be placed on every darknet server to run autonomously from within that server.
  It mainly is able to communicate with a centralized controller through netscript ports. The darknet servers
  are incongruent with our task allocation system, so instead of trying to adapt what we have, we'll aim to manage a
  self-contained controller on each individual darknet server. The controller will decide how to best use its
  available resources and communicate state centrally.
*/
class HydraTask {
  private readonly ns: NS;

  constructor(ns: NS) {
    this.ns = ns;
  }

  async run(): Promise<void> {
    this.ns.tprint(`Hydra starting`);

    while (true) {
      const state = getPortData<HydraStatus>(this.ns, HYDRA_STATE_PORT);

      if (state === undefined) {
        this.ns.exit();
      }

      this.ns.tprint(`ram: ${this.ns.getServerUsedRam()} / ${this.ns.dnet.getBlockedRam()}`);
      await this.ns.asleep(HYDRA_POLL_INTERVAL);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new HydraTask(ns).run();
}
