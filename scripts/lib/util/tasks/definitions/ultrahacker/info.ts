import { DashboardState } from "../../../dashboardTypes";
import { HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";
import { TaskDefinition, TaskState } from "../../types";
import { getPlayerMonitorState } from "../player-monitor/info";

export const ULTRAHACKER_TASK_ID = "ultrahacker";

export interface ServerAnalysis {
  hostname: string;

  hackChance: number;
  maxMoney: number;
  maxTime: number;

  profitScore: number;
}

export interface ServerAnalysisReport {
  // servers are sorted with highest profit servers first, lowest profit last
  analysis: ServerAnalysis[];

  // time this was last computed
  ranAt: number;
}

export type Phase = "hack" | "fix_security" | "fix_money";

export interface HackState {
  hostname: string;
  phase: Phase;
}

export interface UltrahackerTaskState extends TaskState {
  targetReport: ServerAnalysisReport;

  currentTargets: HackState[];

  userTargets: string[];
}

export interface UserCommunicationRequest {
  // Which servers should the ultrahacker target
  targetServers: string[];
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
