export interface HydraControllerState {
  up: boolean;
}

// Sent by the hydra script to update the main controller
export interface HydraInstanceUpdate {
  /* NOTE not currently used */
}

export interface HydraPlayerPassword {
  ip: string;
  password: string;
}

export interface HydraPlayerPasswordFile {
  passwords: HydraPlayerPassword[];
}
