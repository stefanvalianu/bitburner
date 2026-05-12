import { InfiltrationLocation } from "@ns";
import { TaskDefinition, TaskState } from "../../types";

export const INFILTRATOR_TASK_ID = "infiltrator";

export interface InfiltratorTaskState extends TaskState {
  infiltrations: InfiltrationLocation[];
}

export const infiltratorTask: TaskDefinition = {
  id: INFILTRATOR_TASK_ID,
  description: "Provides information on infiltration options, rewards, difficulties.",
  category: "general",
  icon: "🕵️",
  autostart: false,
  demand: {
    priority: "normal",
    unbounded: true,
  }
};
