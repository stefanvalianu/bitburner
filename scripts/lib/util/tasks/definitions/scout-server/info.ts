import { TaskDefinition } from "../../types";

export const SCOUT_SERVER_TASK_ID = "scout-server";

export interface ScoutTaskState extends Record<string, unknown> {
  available: string[]; // sorted, normalized list of currently-hackable hostnames
  target: string | null; // best target by moneyMax among `available`
}

export const scoutServerTask: TaskDefinition = {
  id: SCOUT_SERVER_TASK_ID,
  requirements: {},
  initialState: { available: [], target: null } satisfies ScoutTaskState,
  description: "Dont do this now",
  priority: "disabled",
};
