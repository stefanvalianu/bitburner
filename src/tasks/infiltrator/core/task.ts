import { NS } from "@ns";
import { installEventPatch, dispatchTrusted } from "./eventPatch";
import { findInfiltrationRoot, identify } from "./detector";
import { GAMES } from "./games";
import { BaseTask } from "@repo/common/tasks/baseTask";
import { infiltratorTask, InfiltratorTaskState } from "@repo/tasks/infiltrator/info";

// We need a quick poll interval to act on the games
const POLL_MS = 30;

// We slow down the interval for sending infiltration updates, once a minute
const ANALYSIS_POLL_MS = 60_000;

class InfiltratorTask extends BaseTask<InfiltratorTaskState> {
  constructor(ns: NS) {
    super(ns, infiltratorTask);
  }

  protected async run_task(): Promise<void> {
    // 25GB RAM is charged here for `document` access. The patch installs
    // exactly once per session; subsequent calls are no-ops.
    installEventPatch(document);
    let lastUpdateDate = 0;

    while (true) {
      if (!this.tick()) {
        return;
      }

      let now = Date.now();
      if (now - lastUpdateDate >= ANALYSIS_POLL_MS) {
        lastUpdateDate = now;
        this.update_infiltration_options();
      }

      const root = findInfiltrationRoot(document);
      const game = root ? identify(root) : null;


      if (root && game) {
        try {
          GAMES[game].step(root, (key) => {
            dispatchTrusted(document, key);
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.log.warn(`solver step crashed (${game}): ${msg}`);
        }
      }

      await this.ns.asleep(POLL_MS);
    }
  }

  private update_infiltration_options(): void {
    this.updateState({
      infiltrations: this.ns.infiltration
        .getPossibleLocations()
        .map((location) => this.ns.infiltration.getInfiltration(location.name)),
    } satisfies InfiltratorTaskState);
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new InfiltratorTask(ns).start();
}
