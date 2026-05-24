import { DarknetServerDetails } from "@ns";

export interface DarknetServer extends DarknetServerDetails {
  hostname: string;
  ip: string;

  // an amalgamation of modelId, hostname, and ip used for equality comparisons
  identity: string;
}

export const CYAN = "\u001b[36m";
export const RED = "\u001b[31m";
export const RESET = "\u001b[0m";
