import { NS } from "@ns";
import { SERVER_INFO_PORT, getPortData } from "@repo/common/ports";

export interface Server {
  name: string;
  isPlayerOwned: boolean;
  hasAdmin: boolean;
  isBackdoored: boolean;
  
  ram: number;
  maxRam: number;
  cores: number;

  money: number;
  maxMoney: number;

  security: number;
  minSecurity: number;
}

export interface ServerInfo {
  servers: Server[];
}

export function readServerInfo(ns: NS): ServerInfo | undefined {
  return getPortData<ServerInfo>(ns, SERVER_INFO_PORT);
}
