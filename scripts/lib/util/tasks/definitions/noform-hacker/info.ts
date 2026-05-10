import { HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";
import { TaskDefinition, TaskState } from "../../types";

export const NOFORM_HACKER_TASK_ID = "noform-hacker";

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

export interface NoformHackerTaskState extends TaskState {
  targetReport: ServerAnalysisReport;

  currentTargets: string[];
  userTargets: string[];
}

export interface UserCommunicationRequest {
  // Which servers should the noform hacker target
  targetServers: string[];
}

export const noformHackerTask: TaskDefinition = {
  id: NOFORM_HACKER_TASK_ID,
  description:
    "Hacking controller script to be used before the user has unlocked access to Formulas APIs.",
  category: "hacking",
  icon: "🥈",
  autostart: false,
  communicationPort: HACKING_SYSTEM_COMMUNICATION_PORT,
  demand: {
    priority: "normal",
    unbounded: true,
  },
};
