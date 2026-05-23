import { TaskDefinition } from "@repo/common/tasks/types";

export const BLADE_AGENT_TASK_ID = "blade-agent";

export const bladeAgentTask: TaskDefinition = {
  id: BLADE_AGENT_TASK_ID,
  description: "Manages bladeburner actions and kills synthoids.",
  icon: "⚔️",
  autostart: false,
  demand: {
    priority: "normal",
  }
};
