import { DashboardState } from "../../../dashboardTypes";
import { HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";
import { TaskDefinition, TaskState } from "../../../../../common/tasks/types";
import { getPlayerMonitorState } from "../../player-monitor/info";

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

export interface UltrahackerTaskState extends TaskState {
  // active pipeline target the task is currently scheduling batches against
  target: string;

  // hostname of the target the user has pinned (undefined = auto-select)
  userTarget?: string | undefined;

  // Ranked list of hackable servers. Computed in the task (which is already
  // paying RAM for ns.formulas / ns.getPlayer) and shipped here so the panel
  // can render the table without referencing NS APIs itself.
  targetOptions: ServerAnalysis[];

  // Epoch ms when the current target's pipeline was created (reset on
  // re-target). 0 when no pipeline is active.
  pipelineStartedAt: number;

  // Epoch ms when the FIRST scheduled batch of this pipeline lands its first
  // operation. 0 until the first batch is scheduled; frozen thereafter. Panel
  // uses this to show "first $/xp in T seconds" during pipeline warm-up.
  firstLandingTime: number;

  // Epoch ms when the MOST RECENTLY scheduled batch lands its first operation.
  // Updates every burst. (latestLandingTime - now) is the pipeline's
  // lookahead depth.
  latestLandingTime: number;

  // In-flight batch counts: active = against current target, draining =
  // leftovers from prior targets that we let complete naturally.
  inFlightCount: number;
  drainingCount: number;

  // Epoch ms of the main loop's last tick. Heartbeat — panel can flag the
  // task as stalled if (now - lastTickAt) grows beyond the expected poll
  // interval.
  lastTickAt: number;
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
