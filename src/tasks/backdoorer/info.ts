import { BACKDOORER_STATE_PORT } from "@repo/common/ports";
import { TaskDefinition } from "@repo/common/tasks/types";

export const BACKDOORER_TASK_ID = "backdoorer";

export const backdoorerTask: TaskDefinition = {
  id: BACKDOORER_TASK_ID,
  description: "Attempts to backdoor all available servers. Continues until none are left.",
  icon: "🚪",
  statePort: BACKDOORER_STATE_PORT,
  demand: {
    priority: "normal",
  },
};

export interface BackdoorerState {
  numBackdoored: number;
  total: number;
}
