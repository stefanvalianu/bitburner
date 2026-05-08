
import { availableHostnames, snapshotsEqual } from "../helpers";
import { SCOUT_SERVER_TASK_ID } from "../ids";
import type { TaskDefinition, TaskState } from "./../types";

export interface ScoutTaskState extends Record<string, unknown> {
  available: string[]; // sorted, normalized list of currently-hackable hostnames
  target: string | null; // best target by moneyMax among `available`
}

export const scoutServerTask: TaskDefinition = {
  id: SCOUT_SERVER_TASK_ID,
  scriptPath: "lib/tasks/scout-server.js",
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