import { TaskDefinition } from "@repo/common/tasks/types";
import { NS } from "@ns";

export const GANG_BANGER_TASK_ID = "gang-banger";

export const gangBangerTask: TaskDefinition = {
  id: GANG_BANGER_TASK_ID,
  description: "Manages your gangs. Slum snakes rule!",
  icon: "🐍",
  autostart: false,
  demand: {
    priority: "normal",
  },
  checkRequirements: (ns: NS) => {
    if(!ns.fileExists(ns.enums.ProgramName.formulas, "home")) return "Missing Formulas.exe";

    return undefined;
  },
};
