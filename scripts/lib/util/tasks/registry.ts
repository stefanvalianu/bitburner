import type { TaskDefinition } from "./types";
import { availableHostnames, snapshotsEqual } from "../scout";

// Add new tasks here. Priority is a relative weight — the scheduler
// normalizes weights into percentage shares of total free RAM. A priority of
// 0 means the task is disabled this tick.
export const TASKS: TaskDefinition[] = [
  {
    id: "hack",
    scriptPath: "lib/features/hack-controller-v1.js",
    // Only run when scout-server has published a valid target.
    priority: (state) => (state.scoutState?.target ? 1 : 0),
    requestsAllRam: true,
  },
  {
    id: "scout-server",
    scriptPath: "lib/features/scout-server.js",
    // Run only when the set of hackable servers has changed since last
    // publication. With no published state (first run), the snapshot
    // comparison returns false and we run.
    priority: (state) => {
      const current = availableHostnames(state.servers);
      return snapshotsEqual(current, state.scoutState?.available) ? 0 : 1;
    },
  },
];
