
import { TaskDefinition } from "./types";

export function getTaskScriptPath(task: TaskDefinition): string {
  return `tasks/${task.id}/private/task.js`;
}
