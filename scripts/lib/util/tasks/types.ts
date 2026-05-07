import type { GameState } from "../gameState";

export type TaskId = "hack" | "scout-server";

export interface ServerSlice {
  hostname: string;
  ram: number;
}

export interface Allocation {
  taskId: TaskId;
  servers: ServerSlice[];
}

export interface TaskDefinition {
  id: TaskId;
  scriptPath: string;
  priority: (state: GameState) => number;
}

export interface ActiveTask {
  taskId: TaskId;
  pid: number;
  // Where the controller script itself is running. Prefers home, but falls
  // back to a non-home server if home can't fit the controller's RAM.
  controllerHost: string;
  controllerRam: number;
  allocation: Allocation;
  childPids: number[];
}
