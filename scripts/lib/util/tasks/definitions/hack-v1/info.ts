import { TaskDefinition } from "../../types";

export const HACK_V1_TASK_ID = "hack-v1";

export interface HackTaskState extends Record<string, unknown> {
  target: string | null; // the target this hack run was started against
}

export const hackV1Task: TaskDefinition = {
  id: HACK_V1_TASK_ID,
  requirements: { growUnbounded: true },
  initialState: { target: null } satisfies HackTaskState,
  description: "Dont do this now",
  priority: "disabled",
};
