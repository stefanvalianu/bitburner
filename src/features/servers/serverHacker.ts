import { NS } from "@ns";
import { MutableRefObject } from "react";
import { DashboardState } from "@repo/features/app/DashboardProvider";

export class ServerHacker {
  private readonly ns: NS;
  private readonly gameState: MutableRefObject<DashboardState>;

  constructor(ns: NS, gameState: MutableRefObject<DashboardState>) {
    this.ns = ns;
    this.gameState = gameState;
  }

  // Returns false when there is nothing else to hack
  runTick(): boolean {
    let serversLeft = false;

    for (const server of this.gameState.current.servers) {
      if (!server.purchasedByPlayer && !server.hasAdminRights) {
        this.ns.brutessh(server.hostname);
        this.ns.ftpcrack(server.hostname);
        this.ns.relaysmtp(server.hostname);
        this.ns.httpworm(server.hostname);
        this.ns.sqlinject(server.hostname);

        if (!this.ns.nuke(server.hostname)) {
          serversLeft = true;
        }
      }
    }

    return serversLeft;
  }
}
