export const HACK_V1_TASK_ID = "hack-v1";
export const HACK_V1_SCRIPT_PATH = "lib/tasks/hack-controller-v1.js";

export interface HackTaskState extends Record<string, unknown> {
  target: string | null; // the target this hack run was started against
}
