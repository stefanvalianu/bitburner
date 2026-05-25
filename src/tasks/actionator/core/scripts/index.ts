import { Subscript } from "@repo/tasks/actionator/core/helpers";
import { MINE_GANG_SCRIPT_PATH } from "./mine-gang";
import { GANG_EQUIPMENT_SCRIPT } from "./identify-gang";
import { SLEEVE_UPGRADE_SCRIPT } from "./direct-sleeve-upgrades";

export const ACTIONATOR_SUBSCRIPTS: Subscript[] = [
  /*
    One-Off subscripts
  */
  /*{
    scriptPath: "tasks/actionator/core/scripts/identify-singularity.js",
    repeat: "none",
    requirement: {
      sourceFile: 4,
      level: 1 // this script is cheap enough that we can justify it at 16x GB
    }
  },*/
  {
    scriptPath: GANG_EQUIPMENT_SCRIPT,
    repeat: "none",
    requirement: {
      sourceFile: 2,
      level: 1
    }
  },
  /*
    Eventually we'll want this controller to direct the hydra virus more, for now 
    it just starts it.
  */
  {
    scriptPath: "tasks/actionator/core/scripts/direct-hydra.js",
    repeat: "none",
  },
  /*
    Fast subscripts (info gathering)
  */
  {
    scriptPath: MINE_GANG_SCRIPT_PATH,
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
    scriptPath: "tasks/actionator/core/scripts/mine-bladeburner-info.js",
    repeat: "fast",
  },
  {
    scriptPath: "tasks/actionator/core/scripts/mine-bladeburner-cities.js",
    repeat: "fast",
  },
  {
    scriptPath: "tasks/actionator/core/scripts/mine-bladeburner-actions.js",
    repeat: "fast",
  },
  /*{
    scriptPath: "tasks/actionator/core/scripts/mine-singularity.js",
    repeat: "fast",
    requirement: {
      sourceFile: 4,
      level: 3
    }
  },*/
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
    scriptPath: SLEEVE_UPGRADE_SCRIPT,
    repeat: "slow",
    requirement: {
      sourceFile: 10,
      level: 1
    }
  },
  {
    scriptPath: "tasks/actionator/core/scripts/direct-server-buyer.js",
    repeat: "slow"
  },
  {
    scriptPath: "tasks/actionator/core/scripts/direct-coding-contracts.js",
    repeat: "slow"
  },
  /*{
    // This script uses a minimum of 32GB of ram from the w0rld d3mon destruction.
    // As such, it should probably not be used/included until your default home
    // server has > 64gb of RAM, or it will be hard to auto-place
    scriptPath: "tasks/actionator/core/scripts/direct-end-game.js",
    repeat: "slow",
    requirement: {
      sourceFile: 4,
      level: 3
    }
  },*/
];
