export interface HydraControllerState {
  up: boolean;
  playerCharisma: number;
  haveLabyrinthStasis: boolean;
}

// Sent by the hydra script to update the main controller
export interface HydraInstanceUpdate {
  type: "stasis-linking";
  ip: string;
}
