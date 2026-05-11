import { TaskDefinition } from "../../types";

export const CONTRACT_SOLVER_TASK_ID = "contract-solver";

export const contractSolverTask: TaskDefinition = {
  id: CONTRACT_SOLVER_TASK_ID,
  description: "Looks for and solves coding contracts found on servers.",
  category: "general",
  icon: "🧠",
  autostart: false,
  demand: {
    priority: "normal",
  },
};
