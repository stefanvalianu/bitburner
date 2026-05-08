import { availableHostnames, snapshotsEqual } from "../../helpers";
import type { TaskDefinition, TaskState } from "../../types";
import { SCOUT_SERVER_SCRIPT_PATH, SCOUT_SERVER_TASK_ID, ScoutTaskState } from "./info";

export const scoutServerTask: TaskDefinition = {
  id: SCOUT_SERVER_TASK_ID,
  scriptPath: SCOUT_SERVER_SCRIPT_PATH,
  requirements: {}, // controller-only
  initialState: { available: [], target: null } satisfies ScoutTaskState,
  evaluate: (game, state) => {
    // todo temp
    return "no-change";

    const current = availableHostnames(game.servers);
    const stored = (state as TaskState<ScoutTaskState>).available;
    return snapshotsEqual(current, stored) ? "no-change" : "restart";
  },
};
