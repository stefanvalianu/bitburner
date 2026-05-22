import { lazy, Suspense, useCallback, useState } from "react";
import { Button } from "@repo/features/components/Button";
import { Col } from "@repo/features/components/Col";
import { Modal } from "@repo/features/components/Modal";
import { Panel } from "@repo/features/components/Panel";
import { Row } from "@repo/features/components/Row";
import { TaskId, TaskState } from "@repo/common/tasks/types";
import { Spinner } from "@repo/features/components/Spinner";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useDashboard } from "@repo/features/app/DashboardProvider";
import { PinnedTaskPanel } from "./PinnedTaskPanel";
import { hasCustomPanel } from "@repo/tasks";
import { TaskTile } from "./TaskTile";
import { TaskPanelDialog } from "./TaskPanelDialog";

export function TaskPanel() {
  const theme = useTheme();

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [pinnedTasks, setPinnedTasks] = useState<Set<TaskId>>(new Set());

  const { taskManager } = useDashboard();

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, [setModalOpen]);

  let pinnedItems: TaskState[] = [];
  let gridItems: TaskState[] = [];

  taskManager.tasks.tasks.forEach(t => {
    if (pinnedTasks.has(t.id)) {
      pinnedItems.push(t);
    } else {
      gridItems.push(t);
    }
  });

  const pin = (id: TaskId) => {
    setPinnedTasks((prev) => {
      if (prev.has(id)) return prev;
      let next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const unpin = (id: TaskId) => {
    setPinnedTasks((prev) => {
      if (!prev.has(id)) return prev;
      let next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const stopTask = (id: TaskId) => {
    taskManager.shutdown(id);
  }

  const actions = (
    <Row gap={theme.spacing.sm}>
      {taskManager.isReallocating && (
        <Row gap={theme.spacing.sm} style={{ alignItems: "center", color: theme.colors.secondary }}>
          <Spinner active />
          <span style={{ fontSize: "0.85em" }}>Task manager is busy...</span>
        </Row>
      )}
      <Button onClick={() => setModalOpen(true)} disabled={taskManager.isReallocating}>
        + New task
      </Button>
    </Row>
  );

  return (
    <Panel title="Tasks" actions={actions} style={{ padding: theme.spacing.md }}>
      <Col gap={theme.spacing.md}>
        {pinnedItems.length > 0 && (
          <Col gap={theme.spacing.md}>
            {pinnedItems.map(p => (
              <PinnedTaskPanel
                key={p.id}
                id={p.id}
                state={p}
                disableShutdown={taskManager.isReallocating}
                onStop={stopTask}
                onUnpin={unpin}
              />
            ))}
          </Col>
        )}
        {gridItems.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: theme.spacing.md }}>
            {gridItems.map(g => (
              <TaskTile
                key={g.id}
                id={g.id}
                state={g}
                canPin={hasCustomPanel(g.id)}
                disableShutdown={taskManager.isReallocating}
                onStop={stopTask}
                onPin={pin}
              />
            ))}
          </div>
        )}
      </Col>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="New task"
        style={{ minWidth: 800 }}
      >
        <TaskPanelDialog visible={modalOpen} onClose={closeModal} />
      </Modal>
    </Panel>
  );
}
