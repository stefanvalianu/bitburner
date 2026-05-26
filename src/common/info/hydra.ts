export interface HydraControllerState {
  up: boolean;
  playerCharisma: number;
  // the most important stasis is the one next to a labyrinth
  haveLabyrinthStasis: boolean;

  // when a hydra reaches at least this depth, stasis!
  nextStasisMinDepth: number;
}

// Sent by the hydra script to update the main controller
export interface HydraInstanceUpdate {
  type: "stasis-linking";
  ip: string;
}

export const STASIS_LINK_FILE = ".state/hydra_stasis_link.txt";