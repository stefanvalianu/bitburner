import { SIMPLE_HACKER_TASK_ID } from "../ids";
import { TaskDefinition, TaskState } from "../types";

export const simpleHackerTask: TaskDefinition = {
  id: SIMPLE_HACKER_TASK_ID,
  scriptPath: "lib/tasks/simple-hacker.js",
  requirements: { growUnbounded: true },
  initialState: {},
  evaluate: (game, state, snapshot) => {
    const simpleHackSlot = snapshot.tasks[SIMPLE_HACKER_TASK_ID] as TaskState | undefined;
    if (simpleHackSlot?.status === "running") return "no-change";
    return "restart";
  },
};