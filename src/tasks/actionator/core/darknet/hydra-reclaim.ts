import { NS } from "@ns";
import { HydraCore } from "./hydra-core";

/*
  This is a simple hydra; it simply keeps going until all RAM is reclaimed on the host.

  NOTE: need to see if this is potentially a bad idea, locking down the current server
  for too long. Proliferating is higher priority and if we're stuck on this hydra for
  too long we might miss a chance. See how it plays out.
*/
class ReclaimHydra extends HydraCore {
  constructor(ns: NS) {
    super(ns);
  }

  async run(): Promise<void> {
    this.sendUpdate({
      type: "action",
      action: "reclaiming",
      depth: this.host.depth,
      identity: this.host.identity,
      lastUpdate: Date.now(),
    });

    while (this.ns.dnet.getBlockedRam() > 0) {
      const result = await this.ns.dnet.memoryReallocation();
      if (!result.success) {
        this.ns.tprint(`Weird error reclaiming ${this.host.identity}: ${JSON.stringify(result)}`);
        break;
      }
    }
    
    // always respawn as a main hydra
    this.respawn("main");
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  await new ReclaimHydra(ns).run();
}
