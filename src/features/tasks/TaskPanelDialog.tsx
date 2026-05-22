import { useDashboard } from "@repo/features/app/DashboardProvider";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { Col } from "@repo/features/components/Col";
import { Row } from "@repo/features/components/Row";
import { ALL_TASKS, TASK_BY_ID } from "@repo/tasks";
import { useNs } from "@repo/features/ns/NsProvider";
import { useMemo, useState } from "react";
import { TaskId } from "@repo/common/tasks/types";
import { getTaskScriptPath } from "@repo/common/tasks/helpers";

type Props = {
  onClose: () => void;
}

function TaskPanelDialog({onClose}: Props) {
  const theme = useTheme();
  const ns = useNs();

  const [tasksToStart, setTasksToStart] = useState<Set<TaskId>>(new Set());

  const { taskManager } = useDashboard();

  const toggleSelected = (id: TaskId) => {
    setTasksToStart((prev) => {
      let next = new Set(prev);
      if (prev.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Figure out which ports are in use
  let consumedPorts: Set<number> = new Set();
  taskManager.tasks.tasks.forEach(task => {
    let def = ALL_TASKS.find(t => t.id === task.id);

    if (def?.requestPort && !consumedPorts.has(def.requestPort)) consumedPorts.add(def.requestPort);
    if (def?.statePort && !consumedPorts.has(def.statePort)) consumedPorts.add(def.statePort); 
  });

  // A map of taskId -> reason we can't start it. undefined means we can start it.
  const startableTasks = new Map<TaskId, string | undefined>();

  ALL_TASKS.forEach(def => {
    if (!def.autostart && !taskManager.tasks.tasks.has(def.id)) {
      if ((def.requestPort && consumedPorts.has(def.requestPort) ||
          (def.statePort && consumedPorts.has(def.statePort)))) {
        startableTasks.set(def.id, "Task port(s) already in use.");
      }

      startableTasks.set(def.id, def.checkRequirements ? def.checkRequirements(ns) : undefined);
    }
  });

  const taskRam = useMemo<Map<TaskId, number>>(() => {
    let map = new Map<TaskId, number>();

    for (const task of ALL_TASKS) {
      map.set(task.id, ns.getScriptRam(getTaskScriptPath(task)));
    }

    return map;
  }, [ALL_TASKS]);

  return (
    <>
      {startableTasks.size === 0 ? (
        <span style={{ color: theme.colors.secondary }}>No eligible tasks.</span>
      ) : (
        <Col gap={theme.spacing.lg}>
          {Array.from(startableTasks.entries()).map(kvp => {
            const taskId = kvp[0];
            const cantStartReason: string | undefined = kvp[1];
            const cantStart = cantStartReason !== undefined;
            const task = TASK_BY_ID.get(taskId)!;

            const checked = tasksToStart.has(taskId);
            return (
              <Col key={taskId} gap={theme.spacing.sm}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: theme.spacing.md }}>
                  <label
                    style={{
                      border: `3px solid ${checked ? theme.colors.info : theme.colors.primary}`,
                      background: theme.colors.backgroundsecondary,
                      padding: theme.spacing.md,
                      display: "flex",
                      flexDirection: "column",
                      gap: theme.spacing.sm,
                      flex: "1 1 220px",
                      maxWidth: 240,
                      minWidth: 200,
                      cursor: cantStart ? "not-allowed" : "pointer",
                      opacity: cantStart ? 0.5 : 1,
                    }}
                  >
                    <Row gap={theme.spacing.sm} style={{ alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={cantStart}
                        onChange={() => {
                          if (cantStart) return;
                          toggleSelected(taskId);
                        }}
                        style={{
                          accentColor: theme.colors.info,
                          cursor: cantStart ? "not-allowed" : "pointer",
                        }}
                      />
                      <span
                        style={{
                          color: theme.colors.info,
                          fontWeight: "bold",
                          fontSize: "1.15em",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {task.icon}
                        {taskId}
                      </span>
                    </Row>
                    <span
                      style={{
                        color: theme.colors.secondary,
                        fontSize: "0.85em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {(() => {
                        const entry = taskRam.get(task.id) ?? 0;
                        if (!task.demand.unbounded) return `~ns.format.ram(entry)`;
                        const cap = task.demand.maxRamDemand;
                        const upper = cap == null ? "∞" : ns.format.ram(cap);
                        return `from ~${ns.format.ram(entry)} to ~${upper}`;
                      })()}
                    </span>
                    <span
                      style={{
                        color: theme.colors.primary,
                        fontSize: "0.9em",
                        whiteSpace: "normal",
                        overflowWrap: "break-word",
                      }}
                    >
                      {task.description}
                    </span>
                    {cantStart && (
                      <span style={{ color: theme.colors.warning, fontSize: "0.85em" }}>
                        {cantStartReason}
                      </span>
                    )}
                  </label>
                </div>
              </Col>
            );
          })}
        </Col>
      )}
    </>
  );
}

export default TaskPanelDialog;
