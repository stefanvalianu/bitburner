import type { TaskDefinition } from "./types";

// Add new tasks here. Priority is a relative weight — the scheduler
// normalizes weights into percentage shares of total free RAM.
export const TASKS: TaskDefinition[] = [
  {
    id: "hack",
    scriptPath: "lib/features/hack-controller-v1.js",
    priority: () => 1,
  },
];
