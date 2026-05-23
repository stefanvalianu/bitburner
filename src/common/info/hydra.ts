export interface HydraServer {
  hostname: string;
  state: HydraAction;
  depth: number;
  lastUpdate: number;
}

export interface HydraStatus {
  // A map of hostname to server
  servers: Map<string, HydraServer>;
}

export type HydraAction = "reclaiming-ram" | "idle";

// Sent by the hydra script to update the main controller
export interface HydraInstanceUpdate {
  hostname: string;
  state: HydraAction;
  depth: number;

  lastUpdate: number;
}
