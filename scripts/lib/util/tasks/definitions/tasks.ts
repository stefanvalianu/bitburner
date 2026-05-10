// A simple array of all tasks

import { TaskDefinition } from "../types";
import { noformHackerTask } from "./noform-hacker/info";
import { playerMonitorTask } from "./player-monitor/info";
import { serverDevourerTask } from "./server-devourer/info";
import { serverShareTask } from "./server-share/info";
import { simpleHackerTask } from "./simple-hacker/info";

export const ALL_TASKS: TaskDefinition[] = [
  serverShareTask,
  simpleHackerTask,
  playerMonitorTask,
  noformHackerTask,
  serverDevourerTask,
];
