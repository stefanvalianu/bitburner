import { TaskDefinition } from "../../types";

export const SERVER_SHARE_TASK_ID = "server-share";

export const serverShareTask: TaskDefinition = {
  id: SERVER_SHARE_TASK_ID,
  requirements: { growUnbounded: true },
  initialState: {},
  description: "Dont do this now",
  priority: "disabled",
};
