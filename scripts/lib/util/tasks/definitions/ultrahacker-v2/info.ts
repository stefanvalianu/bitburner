import { DashboardState } from "../../../dashboardTypes";
import { HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";
import { TaskDefinition, TaskState } from "../../types";
import { getPlayerMonitorState } from "../player-monitor/info";

export const ULTRAHACKER_V2_TASK_ID = "ultrahacker-v2";

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

// One in-flight pipeline against a single target. Raw observed values only;
// the panel derives percentages, remaining time, etc.
export interface PipelineSnapshot {
  target: string;

  // number of batches currently in flight on this pipeline
  inFlightCount: number;

  // target depth for HWGW (= floor(weakTime / 50ms), capped)
  maxDepth: number;

  // ordered, oldest-first; UI draws the strip of colored boxes
  recentBatches: FramePurpose[];

  // observed server state at patch time
  targetCurrentSecurity: number;
  targetMinSecurity: number;
  targetCurrentMoney: number;
  targetMaxMoney: number;

  // epoch ms when the soonest in-flight batch should finish; UI computes
  // "remaining" from this
  soonestFinishEpoch: number;

  // true while we've stopped scheduling and are draining in-flight batches
  // before rebasing simServer from the real server
  healing: boolean;
}

export interface UltrahackerV2TaskState extends TaskState {
  targetOptions: ServerAnalysis[];

  // hostname of the target the user has pinned; takes priority
  userTarget?: string | undefined;

  // one snapshot per active pipeline, ordered by priority (primary first)
  pipelines: PipelineSnapshot[];
}

export interface UserCommunicationRequest {
  // Which server should the ultrahacker target
  targetServer?: string | undefined;
}

export const ultrahackerV2Task: TaskDefinition = {
  id: ULTRAHACKER_V2_TASK_ID,
  description:
    "Hacking controller to use in endgame. Updated with the ability to target multiple servers at once.",
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
