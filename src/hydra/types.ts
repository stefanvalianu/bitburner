import { DarknetServerDetails } from "@ns";

export interface DarknetServer extends DarknetServerDetails {
  ip: string;
}

/*
  This state is published to the port represented by the ipv4ToUint32 function.
  If there is state there, it means 1 of 3 things:
  - the state is old and the server has died (trying to connect session with password fails)
  - the state is "infected" and others can connect to the session via password (hydra is running)
  - the state is "infecting" which means someone is already attacking it. Should be ignored

  When a hydra sees a neighbor with the above associated state, it should do these things:
  - "infecting": ignore. Someone else is handling it. RISK: the attacker will be shut down before finishing, leaving it in this dead state (see below)
  - "infected": connect to it using the saved password.
    - If the connection fails, we're dealing with a new server, so start "infecting" it
    - If the connection suceeds, exec() the "hydra" script as a singleton, in case it's not already running

  NOTE: we add an "infectingStart" timestamp when someone starts infecting it. If over 3 minutes have passed, consider the port stale/old
*/
export interface HydraIpPortState {
  ip: string;
  
  /*
    Infected: hydra is successfully started on the server
    Infecting: currently under attack by another hydra
  */
  state: "infected" | "infecting";

  // the time the target went into "infecting" state.
  infectingStart?: number;
  password?: string;

}

// minimal set of info passed from hydra to the authenticate script
export interface HydraAuthInfo {
  sourceIp: string;

  targetIp: string;
  targetPort: number;
  targetModel: string;
  targetPasswordHint: string;
  targetPasswordData: string;
  targetPasswordLength: number;
  targetPasswordDifficulty: number;
  targetPasswordFormat: "numeric" | "alphabetic" | "alphanumeric" | "ASCII" | "unicode";
}

export const CYAN = "\u001b[36m";
export const RED = "\u001b[31m";
export const RESET = "\u001b[0m";

export const LOOT_SCRIPT = "hydra/scripts/loot.js";
export const RECLAIM_SCRIPT = "hydra/scripts/reclaim.js";
export const PHISH_SCRIPT = "hydra/scripts/phish.js";
export const STASIS_SCRIPT = "hydra/scripts/enter-stasis.js";
export const AUTH_SCRIPT = "hydra/scripts/authenticate.js";
export const HYDRA_SCRIPT = "hydra/hydra.js";
