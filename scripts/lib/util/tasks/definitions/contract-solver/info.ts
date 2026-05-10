import { TaskDefinition, TaskState } from "../../types";

export const CONTRACT_SOLVER_TASK_ID = "challenge-solver";

export interface ContractSolverTaskState extends TaskState {
  todo: string
}

export const contractSolverTask: TaskDefinition = {
  id: CONTRACT_SOLVER_TASK_ID,
  description:
    "Looks for and solves coding contracts found on servers.",
  category: "general",
  icon: "🧠",
  autostart: false,
  demand: {
    priority: "normal"
  },
};
