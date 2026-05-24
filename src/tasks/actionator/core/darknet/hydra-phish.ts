import { NS } from "@ns";
import { HydraCore } from "./hydra-core";

/*
  This is a simple hydra; it phishes the host once.
*/
class PhishHydra extends HydraCore {
  constructor(ns: NS) {
    super(ns);
  }

  async run(): Promise<void> {
    this.sendUpdate({
      type: "action",
      action: "phishing",
      depth: this.host.depth,
      identity: this.host.identity,
      hostname: this.host.hostname,
      lastUpdate: Date.now(),
    });

    // FYI phishing attempts can 'fail' because nobody gets fooled. They still give XP
    await this.ns.dnet.phishingAttack();

    // always respawn as a main hydra
    this.respawn("main");
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  await new PhishHydra(ns).run();
}
