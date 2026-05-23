export interface HydraServer {
  hostname: string;
}

export interface HydraStatus {
  // A map of hostname to server
  servers: Map<string, HydraServer>;
}
