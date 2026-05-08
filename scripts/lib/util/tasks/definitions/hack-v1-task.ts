import { HACK_V1_TASK_ID, SCOUT_SERVER_TASK_ID } from "../ids";
import { TaskDefinition, TaskState } from "../types";
import { ScoutTaskState } from "./scout-server-task";

export interface HackTaskState extends Record<string, unknown> {
  target: string | null; // the target this hack run was started against
}

export const hackV1Task: TaskDefinition = {
  id: HACK_V1_TASK_ID,
  scriptPath: "lib/tasks/hack-controller-v1.js",
  requirements: { growUnbounded: true },
  initialState: { target: null } satisfies HackTaskState,
  evaluate: (game, state, snapshot) => {
    // todo temp
    return "no-change";

    const hackv1Slot = snapshot.tasks["hack-v1"] as TaskState<HackTaskState> | undefined;

    // hack-v1 is a weaker version of hack-v2 — once formulas are
    // available, retire any running v1 and don't respawn.
    if (game.inventory.hasFormulas) {
      if (hackv1Slot && hackv1Slot.status === "running") {
        return "shutdown";
      }

      return "no-change";
    }

    const scoutSlot = snapshot.tasks[SCOUT_SERVER_TASK_ID] as
      | TaskState<ScoutTaskState>
      | undefined;
    const desired = scoutSlot?.target ?? null;
    const myTarget = (state as TaskState<HackTaskState>).target;
    // Only run when scout has produced a target, and only restart when
    // that target differs from the one the current run was started with.
    return desired !== null && desired !== myTarget ? "restart" : "no-change";
  },
};