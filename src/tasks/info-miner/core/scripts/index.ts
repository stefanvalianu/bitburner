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
    scriptPath: "tasks/info-miner/core/scripts/identify-servers.js",
    repeated: false,
  },
  {
    scriptPath: "tasks/info-miner/core/scripts/mine-player.js",
    repeated: true,
  },
  {
    scriptPath: "tasks/info-miner/core/scripts/mine-servers.js",
    repeated: true,
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
];
