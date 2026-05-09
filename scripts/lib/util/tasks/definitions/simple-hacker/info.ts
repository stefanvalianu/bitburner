import { TaskDefinition } from "../../types";

export const SIMPLE_HACKER_TASK_ID = "simple-hacker";
export const SIMPLE_HACKER_SCRIPT_PATH = "lib/tasks/simple-hacker.js";

export const simpleHackerTask: TaskDefinition = {
  id: SIMPLE_HACKER_TASK_ID,
  requirements: { growUnbounded: true },
  initialState: {},
  description: "Dont do this now",
  priority: "disabled",
};
