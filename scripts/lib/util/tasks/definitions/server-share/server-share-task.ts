import { TaskDefinition, TaskState } from "../../types";
import { SERVER_SHARE_SCRIPT_PATH, SERVER_SHARE_TASK_ID } from "./info";

export const serverShareTask: TaskDefinition = {
  id: SERVER_SHARE_TASK_ID,
  scriptPath: SERVER_SHARE_SCRIPT_PATH,
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
