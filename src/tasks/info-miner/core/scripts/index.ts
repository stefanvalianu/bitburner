export interface SourcefileRequirement {
  sourceFile: number;
  level: number;
}

export interface Subscript {
  scriptPath: string;

  // Scripts that are not repeated will only run once.
  repeated: boolean;

  // Optionally define requirements to include this script in the chain
  requirement?: SourcefileRequirement;
}

export const INFO_MINER_SUBSCRIPTS: Subscript[] = [
  {
    scriptPath: "tasks/info-miner/core/scripts/identify-singularity.js",
    repeated: false,
    requirement: {
      sourceFile: 4,
      level: 1 // this script is cheap enough that we can justify it at 16x GB
    }
  },
  {
    scriptPath: "tasks/info-miner/core/scripts/mine-gang.js",
    repeated: true,
    requirement: {
      sourceFile: 2,
      level: 1,
    },
  },
  {
    scriptPath: "tasks/info-miner/core/scripts/mine-sleeves.js",
    repeated: true,
    requirement: {
      sourceFile: 10,
      level: 1
    }
  },
  {
    scriptPath: "tasks/info-miner/core/scripts/mine-singularity.js",
    repeated: false,
    requirement: {
      sourceFile: 4,
      level: 3
    }
  },
];
