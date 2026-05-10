import { TaskDefinition } from "../../types";

export const SERVER_DEVOURER_TASK_ID = "server-devourer";

export const serverDevourerTask: TaskDefinition = {
  id: SERVER_DEVOURER_TASK_ID,
  description:
    "Meant to be ran at the end of a run, will use all available resources to hack all available servers in a round-robin fashion (quickest first)",
  autostart: false,
  demand: {
    priority: "normal",
    unbounded: true,
  },
};
