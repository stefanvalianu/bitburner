import type { NS } from "@ns";
import type { Allocation, TaskDefinition, TaskEvent, TaskManagerState, TaskState } from "@repo/common/tasks/types";
import { createLogger, Logger } from "@repo/common/logger";
import { getPortData, TASK_EVENTS_PORT, TASK_STATE_PORT } from "@repo/common/ports";

export abstract class BaseTask {
  protected readonly ns: NS;
  protected readonly taskDefinition: TaskDefinition;
  protected readonly log: Logger;

  protected taskState: TaskState | null;

  constructor(ns: NS, task: TaskDefinition) {
    this.ns = ns;
    this.taskDefinition = task;
    this.log = createLogger(ns, task.id);
    this.taskState = null;
  }

  // Entrypoint. Run the subclass body and surface any error.
  async start(): Promise<void> {
    try {
      this.refreshTaskState();
      await this.run_task();
    } catch (e) {
      this.log.error(`task crashed: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }

  // Subclasses implement their behavior here. They have access to all the
  // protected accessors below. Avoiding name `run` since that adds RAM cost lol
  protected abstract run_task(): Promise<void>;

  // Subclasses can implement custom logic if needed to handle shutdown behavior.
  protected abstract shutdown(): void;
  
  // This should be called periodically from subclasses to check for lifecylce events
  protected tick(): void {
    this.refreshTaskState();

    if (this.taskState?.shutdownRequested || false) {
      this.shutdown();
      return;
    }
  }

  protected emitEvent(event: TaskEvent): void {
    this.ns.getPortHandle(TASK_EVENTS_PORT).write(event);
  }

  // Helper for refreshing our specific task state from the overall snapshot
  private refreshTaskState(): void {
    const data = getPortData<TaskManagerState>(this.ns, TASK_STATE_PORT);
    const slot = data?.tasks.get(this.taskDefinition.id) as TaskState;
    this.taskState = slot ?? null;
  }
}
