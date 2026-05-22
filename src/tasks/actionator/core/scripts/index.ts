import { Subscript } from "@repo/tasks/actionator/core/helpers";

export const ACTIONATOR_SUBSCRIPTS: Subscript[] = [
  /*
    One-Off subscripts
  */
  {
    scriptPath: "tasks/actionator/core/scripts/identify-singularity.js",
    repeat: "none",
    requirement: {
      sourceFile: 4,
      level: 1 // this script is cheap enough that we can justify it at 16x GB
    }
  },
  {
    scriptPath: "tasks/actionator/core/scripts/identify-gang.js",
    repeat: "none",
    requirement: {
      sourceFile: 2,
      level: 1
    }
  },
  /*
    Fast subscripts (info gathering)
  */
  {
    scriptPath: "tasks/actionator/core/scripts/mine-gang.js",
    repeat: "fast",
    requirement: {
      sourceFile: 2,
      level: 1,
    },
  },
  {
    scriptPath: "tasks/actionator/core/scripts/mine-sleeves.js",
    repeat: "fast",
    requirement: {
      sourceFile: 10,
      level: 1
    }
  },
  {
    scriptPath: "tasks/actionator/core/scripts/mine-singularity.js",
    repeat: "fast",
    requirement: {
      sourceFile: 4,
      level: 3
    }
  },
  /*
    Slow subscripts (directing game systems)
  */
  {
    scriptPath: "tasks/actionator/core/scripts/direct-gang.js",
    repeat: "slow",
    requirement: {
      sourceFile: 2,
      level: 1
    }
  },
  {
    scriptPath: "tasks/actionator/core/scripts/direct-sleeves.js",
    repeat: "slow",
    requirement: {
      sourceFile: 10,
      level: 1
    }
  },
  {
    scriptPath: "tasks/actionator/core/scripts/direct-coding-contracts.js",
    repeat: "slow"
  },
];
