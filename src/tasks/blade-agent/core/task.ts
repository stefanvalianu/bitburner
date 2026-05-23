import { NS } from "@ns";
import { BaseTask } from "@repo/common/tasks/baseTask";
import { bladeAgentTask } from "../info";
import { BLADEBURNER_STATE_PORT, getPortData } from "@repo/common/ports";
import { Action, BladeburnerState, sameAction } from "@repo/common/info/bladeburnerInfo";
import { chooseCity } from "./citySelection";
import { spendOneSkillPoint } from "./skillSelection";
import { chooseAction } from "./actionSelection";

const STAMINA_LOW = 0.50;
const STAMINA_HIGH = 0.56;

const MIN_SWITCH_WASTE_MS = 5_000;
const NEAR_DONE_MS = 2_000;

interface BladeburnerTaskState {
  recoveringStamina: boolean;
  autoLevelInitialized: boolean;
  lastStartedAction: Action | null;
  lastStartedAt: number;
  inFaction: boolean;
}

class BladeAgentTask extends BaseTask {
  private bladeburnerTaskState: BladeburnerTaskState;

  constructor(ns: NS) {
    super(ns, bladeAgentTask);

    this.bladeburnerTaskState = {
      autoLevelInitialized: false,
      recoveringStamina: false,
      lastStartedAction: null,
      lastStartedAt: 0,
      inFaction: false,
    }
  }

  protected async run_task(): Promise<void> {
    // wait until we have state
    await this.ns.nextPortWrite(BLADEBURNER_STATE_PORT);

    const joined = await this.waitUntilInBladeburnerDivision();

    if (!joined) return;
    
    while (true) {
      if (!this.tick()) {
        return;
      }

      const state = getPortData<BladeburnerState>(this.ns, BLADEBURNER_STATE_PORT);

      if (state === undefined) {
        this.log.error(`Unexpectedly got null port data from bladeburner state port.`);
        return;
      }

      // Set whether we should be recovering stamina 
      this.refreshRecoveryMode(state);

      // Set whatever action we're doing to auto-level
      this.initializeAutoLevel(state);

      // Perform a skill purchase action optimally, if possible
      spendOneSkillPoint(this.ns, state);

      // Auto-join the faction for convenience
      if (!this.bladeburnerTaskState.inFaction) {
        this.bladeburnerTaskState.inFaction = this.ns.bladeburner.joinBladeburnerFaction();
      }

      // Move to the best city for operations
      const bestCity = chooseCity(state);
      if (bestCity !== state.city) {
        this.ns.bladeburner.switchCity(bestCity);

        // update the current state snapshot for the rest of the simulation
        state.city = bestCity;
      }

      // Take the best action
      const desiredAction = chooseAction(state, this.bladeburnerTaskState.recoveringStamina);
      if (desiredAction && this.shouldSwitch(state, desiredAction)) {
        const started = this.ns.bladeburner.startAction(desiredAction.type, desiredAction.name);

        if (started) {
          this.bladeburnerTaskState.lastStartedAction = desiredAction;
          this.bladeburnerTaskState.lastStartedAt = Date.now();
        }
      }

      await this.ns.bladeburner.nextUpdate();
    }
  }

  // Heuristically decide if an action is worth running
  private shouldSwitch(state: BladeburnerState, desired: Action): boolean {
    const current = state.currentAction;

    if (!current) return true;
    if (sameAction(current, desired)) return false;

    if (desired.type === "Black Operations") {
      return true;
    }

    if (current.currentTimeMs <= MIN_SWITCH_WASTE_MS) {
      return true;
    }

    if (current.totalTimeMs - current.currentTimeMs <= NEAR_DONE_MS) {
      return false;
    }

    return false;
  }

  private initializeAutoLevel(state: BladeburnerState): void {
    if (this.bladeburnerTaskState.autoLevelInitialized) return;

    for (const action of state.actions) {
      this.ns.bladeburner.setActionAutolevel(action.type, action.name, true);
    }

    this.bladeburnerTaskState.autoLevelInitialized = true;
  }

  private refreshRecoveryMode(state: BladeburnerState): void {
    this.bladeburnerTaskState.recoveringStamina =
      state.stamina.pct < STAMINA_LOW || (this.bladeburnerTaskState.recoveringStamina && state.stamina.pct < STAMINA_HIGH);
  }

  // Wait until we're able to successfully join the bladeburner division
  private async waitUntilInBladeburnerDivision(): Promise<boolean> {
    let inDivision = this.ns.bladeburner.inBladeburner();

    while (!inDivision) {
      if (!this.tick()) {
        return false;;
      }

      inDivision = this.ns.bladeburner.joinBladeburnerDivision();
      await this.ns.asleep(10_000);
    }

    return true;
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new BladeAgentTask(ns).start();
}
