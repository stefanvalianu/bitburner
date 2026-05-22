import { Subscript } from "@repo/common/tasks/types";

export const ACTIONATOR_SUBSCRIPTS: Subscript[] = [
  {
    scriptPath: "tasks/actionator/core/scripts/_____.js",
    repeated: true,
    requirement: {
      sourceFile: 2,
      level: 1,
    },
  },
  {
    scriptPath: "tasks/actionator/core/scripts/_____.js",
    repeated: true,
    requirement: {
      sourceFile: 10,
      level: 1
    }
  },
];
