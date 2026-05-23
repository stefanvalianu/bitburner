export interface HydraServer {
  hostname: string;
}

export interface HydraStatus {
  // A map of hostname to server
  servers: Map<string, HydraServer>;

  // Set to true so hydra tasks exit()
  poisoned: boolean;
}

export const HYDRA_EXIT_STATUS: HydraStatus = {
  servers: new Map(),
  poisoned: true,
}
