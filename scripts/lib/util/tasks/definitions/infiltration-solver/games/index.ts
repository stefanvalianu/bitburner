import { InfilGameId } from "../info";
import * as slash from "./slash";
import * as bracket from "./bracket";
import * as backward from "./backward";
import * as bribe from "./bribe";
import * as cheatCode from "./cheatCode";
import * as cyberpunk2077 from "./cyberpunk2077";
import * as minesweeper from "./minesweeper";
import * as wireCutting from "./wireCutting";

export interface GameModule {
  step(root: Element, dispatch: (key: string) => void): boolean;
}

export const GAMES: Record<InfilGameId, GameModule> = {
  slash,
  bracket,
  backward,
  bribe,
  cheatCode,
  cyberpunk2077,
  minesweeper,
  wireCutting,
};
