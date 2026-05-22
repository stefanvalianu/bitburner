import { TaskDefinition } from "@repo/common/tasks/types";
import { ACTIONATOR_SUBSCRIPTS } from "./core/scripts";

export const ACTIONATOR_TASK_ID = "actionator";

export const actionatorTask: TaskDefinition = {
  id: ACTIONATOR_TASK_ID,
  description: "Takes various game actions like directing sleeves, the player, etc.",
  icon: "👣",
  autostart: true,
  demand: {
    priority: "critical",
    additionalHeadroomSubscripts: ACTIONATOR_SUBSCRIPTS.map(s => s.scriptPath)
  },
};
