import { InfiltrationLocation } from "@ns";
import { INFILTRATOR_STATE_PORT } from "@repo/common/ports";
import { TaskDefinition } from "@repo/common/tasks/types";

export const INFILTRATOR_TASK_ID = "infiltrator";

export const infiltratorTask: TaskDefinition = {
  id: INFILTRATOR_TASK_ID,
  description: "Plays infiltration games for you and identifies infiltration options.",
  icon: "🕵️",
  autostart: false,
  statePort: INFILTRATOR_STATE_PORT,
  demand: {
    priority: "normal",
  },
};

export interface InfiltratorTaskState {
  infiltrations: InfiltrationLocation[];
}
