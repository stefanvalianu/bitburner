import { TaskDefinition } from "../../types";

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

export interface NoformHackerTaskState extends Record<string, unknown> {
  targetReport: ServerAnalysisReport;

  currentTargets: string[];
}

export const noformHackerTask: TaskDefinition = {
  id: NOFORM_HACKER_TASK_ID,
  description:
    "Hacking controller script to be used before the user has unlocked access to Formulas APIs.",
  icon: "🥈",
  autostart: false,
  communicationPort: 10,
  demand: {
    priority: "normal",
    unbounded: true,
  },
};
