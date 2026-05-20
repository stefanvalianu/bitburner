import { TaskDefinition } from "@repo/common/tasks/types";

export const INFO_MINER_TASK_ID = "info-miner";

export const infoMinerTask: TaskDefinition = {
  id: INFO_MINER_TASK_ID,
  description: "Periodically crawls for general information to present it in central dashboard panels.",
  category: "general",
  icon: "ℹ️",
  autostart: true,
  demand: {
    priority: "critical",
  },
};
