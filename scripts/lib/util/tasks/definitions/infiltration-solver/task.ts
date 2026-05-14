import { NS } from "@ns";
import { BaseTask } from "../../baseTask";
import { INFILTRATION_SOLVER_TASK_ID, InfiltrationSolverTaskState, InfilGameId } from "./info";
import { installEventPatch, dispatchTrusted } from "./eventPatch";
import { findInfiltrationRoot, identify } from "./detector";
import { GAMES } from "./games";

const POLL_MS = 30;

class InfiltrationSolverTask extends BaseTask<InfiltrationSolverTaskState> {
  constructor(ns: NS) {
    super(ns, INFILTRATION_SOLVER_TASK_ID);
  }

  protected async run_task(): Promise<void> {
    // 25GB RAM is charged here for `document` access. The patch installs
    // exactly once per session; subsequent calls are no-ops.
    installEventPatch(document);
    this.patchState({ currentGame: null, keysSent: 0, lastError: null });

    let currentGame: InfilGameId | null = null;
    let keysSent = 0;
    let lastPublishedKeys = 0;

    while (!this.shouldShutdown) {
      const root = findInfiltrationRoot(document);
      const game = root ? identify(root) : null;

      if (game !== currentGame) {
        currentGame = game;
        this.patchState({ currentGame: game });
      }

      if (root && game) {
        try {
          const dispatched = GAMES[game].step(root, (key) => {
            dispatchTrusted(document, key);
            keysSent++;
          });
          if (dispatched && keysSent !== lastPublishedKeys) {
            lastPublishedKeys = keysSent;
            this.patchState({ keysSent });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.log.warn(`solver step crashed (${game}): ${msg}`);
          this.patchState({ lastError: `${game}: ${msg}` });
        }
      }

      await this.ns.asleep(POLL_MS);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new InfiltrationSolverTask(ns).start();
}
