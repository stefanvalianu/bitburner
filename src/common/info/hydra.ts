export interface HydraServer {
  identity: string;
  action: HydraAction;
  depth: number;
  password?: string;
  lastUpdate: number;

  /*
    Controller-decided value indicating whether this server is running OK.
    Servers that are unhealthy, the controller will try to re-start, or 
    leave to other hydra scripts to bootstraip (exec) when they are around.
    Servers that are unhealthy for over some time are removed from the map
  */
  healthy: true;
}

export interface HydraStatus {
  // A map of identity to server
  servers: Map<string, HydraServer>;

  // servers we literally lack the tooling to infect. Don't bother
  uninfectableServers: Set<string>;

  // filename -> content
  notesFound: Map<string, string>;
}

export type HydraAction = "none" | "phishing" | "reclaiming" | "proliferating";

// Sent by the hydra script to update the main controller
export interface HydraInstanceUpdate {
  identity: string;
  action: HydraAction;
  depth: number;
  password?: string;
  lastUpdate: number;

  // filename -> content
  notesFound?: Record<string, string>;
}
