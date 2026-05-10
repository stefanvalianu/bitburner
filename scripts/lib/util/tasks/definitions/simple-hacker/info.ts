import { HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";
import { TaskDefinition } from "../../types";

export const SIMPLE_HACKER_TASK_ID = "simple-hacker";

export const simpleHackerTask: TaskDefinition = {
  id: SIMPLE_HACKER_TASK_ID,
  description:
    "Very simple hacking script that deploys a simple 'hack myself' script to all nodes.",
  category: "hacking",
  icon: "🥉",
  autostart: false,
  communicationPort: HACKING_SYSTEM_COMMUNICATION_PORT,
  demand: {
    priority: "normal",
    unbounded: true,
  },
};
