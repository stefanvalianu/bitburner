// A simple array of all tasks

import { TaskDefinition } from "../types";
import { hackV1Task } from "./hack-v1/info";
import { playerMonitorTask } from "./player-monitor/info";
import { serverShareTask } from "./server-share/info";
import { simpleHackerTask } from "./simple-hacker/info";

export const TASKS: TaskDefinition[] = [
  //hackV1Task,
  //serverShareTask,
  //simpleHackerTask,
  playerMonitorTask,
];
