import type { NS } from "@ns";
import type { TaskDefinition, TaskEvent, TaskManagerState, TaskState } from "@repo/common/tasks/types";
import { createLogger, Logger } from "@repo/common/logger";
import { getPortData, TASK_EVENTS_PORT, TASK_STATE_PORT } from "@repo/common/ports";

export abstract class BaseTask<TState = undefined> {
  protected readonly ns: NS;
  protected readonly taskDefinition: TaskDefinition;
  protected readonly log: Logger;

  // contains task management information
  private managementState: TaskState | null;

  // for task-specific state information for tasks that define it
  private taskState: TState | null;

  constructor(ns: NS, task: TaskDefinition) {
    this.ns = ns;
    this.taskDefinition = task;
    this.log = createLogger(ns, task.id);
    this.managementState = null;
    this.taskState = null;
  }

  protected get management_state(): Readonly<TaskState> | null {
    return this.managementState;
  }

  protected get state(): Readonly<TState> | null {
    return this.taskState;
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
  protected shutdown(): void { }
  
  // This should be called periodically from subclasses to check for lifecylce events.
  // Returns false when the task has shut down.
  protected tick(): boolean {
    this.refreshTaskState();

    if (this.managementState?.shutdownRequested || false) {
      this.shutdown();
      return false;
    }

    return true;
  }

  // broadcasts the currently set state on the task's configured state port
  protected updateState(state: TState | null): void {
    this.taskState = state;
    
    if (this.taskDefinition.statePort) {
      this.ns.clearPort(this.taskDefinition.statePort);

      if (this.state !== null) {
        this.ns.writePort(this.taskDefinition.statePort, this.state);
      }
    } else {
      this.log.error(`Task trying to write state without a statePort defined.`);
    }
  }

  protected emitEvent(event: TaskEvent): void {
    this.ns.getPortHandle(TASK_EVENTS_PORT).write(event);
  }

  // Helper for refreshing our specific task state from the overall snapshot
  private refreshTaskState(): void {
    const data = getPortData<TaskManagerState>(this.ns, TASK_STATE_PORT);
    const slot = data?.tasks.get(this.taskDefinition.id) as TaskState;
    this.managementState = slot ?? null;
  }
}
