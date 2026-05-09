import { TaskDefinition } from "../../types";

export const SERVER_SHARE_TASK_ID = "server-share";

export const serverShareTask: TaskDefinition = {
  id: SERVER_SHARE_TASK_ID,
  description: "Simply shares a bunch of servers with your faction for increased reputation gain.",
  demands: {
    priority: "normal",
    autostart: false,
    unbounded: true,
    maxRamDemand: 256
  }
};
