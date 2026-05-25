import { TaskDefinition } from "@repo/common/tasks/types";
import { ACTIONATOR_SUBSCRIPTS } from "./core/scripts";

export const ACTIONATOR_TASK_ID = "actionator";

export const actionatorTask: TaskDefinition = {
  id: ACTIONATOR_TASK_ID,
  description: "Repeatedly cycles through various tasks to take game actions that optimize RAM usage.",
  icon: "♾️",
  autostart: true,
  demand: {
    priority: "critical",
    prioritizeHome: true,
    additionalHeadroomSubscripts: ACTIONATOR_SUBSCRIPTS.map(s => s.scriptPath)
  },
};
