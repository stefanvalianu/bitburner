import { TaskDefinition, TaskState } from "../../types";
import { SIMPLE_HACKER_SCRIPT_PATH, SIMPLE_HACKER_TASK_ID } from "./info";

export const simpleHackerTask: TaskDefinition = {
  id: SIMPLE_HACKER_TASK_ID,
  scriptPath: SIMPLE_HACKER_SCRIPT_PATH,
  requirements: { growUnbounded: true },
  initialState: {},
  evaluate: (game, state, snapshot) => {
    const simpleHackSlot = snapshot.tasks[SIMPLE_HACKER_TASK_ID] as TaskState | undefined;
    if (simpleHackSlot?.status === "running") return "no-change";
    return "restart";
  },
};
