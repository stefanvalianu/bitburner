import { DarknetServerDetails } from "@ns";

export interface DarknetServer extends DarknetServerDetails {
  hostname: string;
}

export const CYAN = "\u001b[36m";
export const RED = "\u001b[31m";
export const RESET = "\u001b[0m";