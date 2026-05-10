import type { ReactNode } from "react";
import type { TaskState } from "../util/tasks/types";
import { NOFORM_HACKER_TASK_ID } from "../util/tasks/definitions/noform-hacker/info";
import { NoformHackerPanel } from "../util/tasks/definitions/noform-hacker/panel";

// -------------------NOTE-----------------------
// Do not use netscript functions that have a
// ram cost in these panels! That will increase
// the ram cost of the root dashboard script,
// which we ABSOLUTELY DO NOT WANT!
// ----------------------------------------------
export type TaskCustomPanel = (props: { id: string; slot: TaskState }) => ReactNode;

export const TASK_CUSTOM_PANELS: Record<string, TaskCustomPanel> = {
  [NOFORM_HACKER_TASK_ID]: NoformHackerPanel,
};

export function hasCustomPanel(id: string): boolean {
  return TASK_CUSTOM_PANELS[id] != null;
}
