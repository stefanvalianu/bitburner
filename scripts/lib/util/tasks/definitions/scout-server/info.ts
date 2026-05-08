export const SCOUT_SERVER_TASK_ID = "scout-server";
export const SCOUT_SERVER_SCRIPT_PATH = "lib/tasks/scout-server.js";

export interface ScoutTaskState extends Record<string, unknown> {
  available: string[]; // sorted, normalized list of currently-hackable hostnames
  target: string | null; // best target by moneyMax among `available`
}
