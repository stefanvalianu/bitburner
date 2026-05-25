export interface HydraControllerState {
  up: boolean;
  haveLabyrinthStasis: boolean;
}

// Sent by the hydra script to update the main controller
export interface HydraInstanceUpdate {
  type: "stasis-linking";
  ip: string;
}

export interface HydraPlayerPassword {
  ip: string;
  password: string;
}

export interface HydraPlayerPasswordFile {
  passwords: HydraPlayerPassword[];
}
