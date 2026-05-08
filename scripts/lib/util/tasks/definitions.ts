import { hackV1Task } from "./definitions/hack-v1-task";
import { scoutServerTask } from "./definitions/scout-server-task";
import { serverShareTask } from "./definitions/server-share-task";
import { simpleHackerTask } from "./definitions/simple-hacker-task";

// ---------------------------------------------------------------------------
// TASKS
//
// Order matters: when multiple growUnbounded tasks would run on the same
// tick, the manager picks the first one in this list. Keep the most
// important growUnbounded task at the top.
// ---------------------------------------------------------------------------

export const TASKS = [
  scoutServerTask,
  hackV1Task,
  serverShareTask,
  simpleHackerTask
];
