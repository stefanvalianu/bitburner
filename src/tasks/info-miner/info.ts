import { TaskDefinition } from "@repo/common/tasks/types";
import { INFO_MINER_SUBSCRIPTS } from "./core/scripts";

export const INFO_MINER_TASK_ID = "info-miner";

export const infoMinerTask: TaskDefinition = {
  id: INFO_MINER_TASK_ID,
  description: "Periodically crawls for general information to present it in central dashboard panels.",
  icon: "ℹ️",
  autostart: true,
  demand: {
    priority: "critical",
    additionalHeadroomSubscripts: INFO_MINER_SUBSCRIPTS.map(s => s.scriptPath)
  },
};
