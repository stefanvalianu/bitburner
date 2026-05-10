import { TaskDefinition } from "../../types";

export const SERVER_DEVOURER_TASK_ID = "server-devourer";

export const serverDevourerTask: TaskDefinition = {
  id: SERVER_DEVOURER_TASK_ID,
  description:
    "Uses all available resources to ONLY hack all available servers in a round-robin fashion (quickest first).",
  icon: "🍕",
  autostart: false,
  communicationPort: 10,
  demand: {
    priority: "normal",
    unbounded: true,
  },
};
