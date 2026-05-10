import { TaskDefinition } from "../../types";

export const SIMPLE_HACKER_TASK_ID = "simple-hacker";

export const simpleHackerTask: TaskDefinition = {
  id: SIMPLE_HACKER_TASK_ID,
  description:
    "Very simple hacking script that deploys a simple 'hack myself' script to all nodes.",
  icon: "🥉",
  autostart: false,
  demand: {
    priority: "normal",
    unbounded: true,
  },
};
