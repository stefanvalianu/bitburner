import { TaskDefinition, TaskState } from "../../types";

export const INFILTRATION_SOLVER_TASK_ID = "infiltration-solver";

export type InfilGameId =
  | "slash"
  | "bracket"
  | "backward"
  | "bribe"
  | "cheatCode"
  | "cyberpunk2077"
  | "minesweeper"
  | "wireCutting";

export interface InfiltrationSolverTaskState extends TaskState {
  // Which minigame is currently mounted, or null when no infiltration is active.
  currentGame: InfilGameId | null;
  // Cumulative count of keys the solver has dispatched since the task started.
  keysSent: number;
  // Last error string (e.g. unparseable wire-cutting rules), or null.
  lastError: string | null;
}

export const infiltrationSolverTask: TaskDefinition = {
  id: INFILTRATION_SOLVER_TASK_ID,
  description:
    "Plays infiltration minigames automatically by monkey-patching keydown listeners. Start BEFORE clicking Infiltrate Company.",
  category: "general",
  icon: "🎮",
  autostart: false,
  demand: {
    priority: "normal",
  },
};
