import { DashboardState } from "../../../dashboardTypes";
import { HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";
import { TaskDefinition, TaskState } from "../../types";
import { getPlayerMonitorState } from "../player-monitor/info";

export const ULTRAHACKER_TASK_ID = "ultrahacker";

export interface ServerAnalysis {
  hostname: string;

  hackChance: number;

  // approximate batch time for HWGW (not perfectly simulated)
  batchTime: number;

  maxMoney: number;

  profitPerSecond: number;

  xpPerSecond: number;
}

export type FramePurpose = "W" | "GW" | "HWGW";

export interface UltrahackerTaskState extends TaskState {
  targetOptions: ServerAnalysis[];

  // actual target we're attacking
  target: string;

  // hostname of the target the user has chosen
  userTarget?: string | undefined;

  // visualize the batch types being placed on available leases
  batches: FramePurpose[];

  // raw server status for the current target, sampled at patch time
  targetCurrentSecurity: number;
  targetMinSecurity: number;
  targetCurrentMoney: number;
  targetMaxMoney: number;

  // epoch time when we expect this recent frame to be finished
  estimatedFinishTime: number;
}

export interface UserCommunicationRequest {
  // Which server should the ultrahacker target
  targetServer?: string | undefined;
}

export const ultrahackerTask: TaskDefinition = {
  id: ULTRAHACKER_TASK_ID,
  description: "Hacking controller to use in endgame.",
  category: "hacking",
  icon: "🏅",
  autostart: false,
  communicationPort: HACKING_SYSTEM_COMMUNICATION_PORT,
  demand: {
    priority: "normal",
    unbounded: true,
  },
  checkRequirements: (state: DashboardState) => {
    const playerState = getPlayerMonitorState(state);
    if (playerState === undefined || playerState.inventory === undefined) return "Just a sec...";
    if (!playerState.inventory.hasFormulas) return "Missing Formulas.exe";

    return undefined;
  },
};
