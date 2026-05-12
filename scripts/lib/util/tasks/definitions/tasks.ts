// A simple array of all tasks

import { TaskDefinition } from "../types";
import { contractSolverTask } from "./contract-solver/info";
import { noformHackerTask } from "./noform-hacker/info";
import { playerMonitorTask } from "./player-monitor/info";
import { serverBuyerTask } from "./server-buyer/info";
import { serverDevourerTask } from "./server-devourer/info";
import { serverShareTask } from "./server-share/info";
import { ultrahackerTask } from "./ultrahacker/info";

// highest in list = shows first in 'new task' UX per category
export const ALL_TASKS: TaskDefinition[] = [
  contractSolverTask,
  playerMonitorTask,
  serverBuyerTask,
  ultrahackerTask,
  noformHackerTask,
  serverDevourerTask,
  serverShareTask,
];
