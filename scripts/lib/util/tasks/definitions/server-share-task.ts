import { SERVER_SHARE_TASK_ID } from "../ids";
import { TaskDefinition, TaskState } from "../types";

export const serverShareTask: TaskDefinition = {
  id: SERVER_SHARE_TASK_ID,
  scriptPath: "lib/tasks/server-share.js",
  requirements: { growUnbounded: true },
  initialState: {},
  evaluate: (game, state, snapshot) => {
    // todo temp
    return "no-change";

    const shareSlot = snapshot.tasks[SERVER_SHARE_TASK_ID] as TaskState | undefined;
    if (shareSlot?.status === "running") return "no-change";
    return "restart";
  },
};