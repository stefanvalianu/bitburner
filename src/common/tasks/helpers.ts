
import { TaskDefinition } from "./types";

export function getTaskScriptPath(task: TaskDefinition): string {
  return `tasks/${task.id}/core/task.js`;
}
