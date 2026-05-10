import { HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";
import { TaskDefinition } from "../../types";

export const SERVER_DEVOURER_TASK_ID = "server-devourer";

export const serverDevourerTask: TaskDefinition = {
  id: SERVER_DEVOURER_TASK_ID,
  description:
    "Uses all available resources to ONLY hack all available servers in a round-robin fashion (quickest first).",
  icon: "🍕",
  autostart: false,
  communicationPort: HACKING_SYSTEM_COMMUNICATION_PORT,
  demand: {
    priority: "normal",
    unbounded: true,
  },
};
