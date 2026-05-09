import { useState } from "react";
import { Button } from "../ui/Button";
import { Col } from "../ui/Col";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { BracesIcon, HomeIcon, PowerIcon } from "../ui/Icons";
import { Modal } from "../ui/Modal";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { ALL_TASKS } from "../util/tasks/definitions/tasks";
import type { TaskDefinition, TaskState } from "../util/tasks/types";

const TASK_BY_ID = new Map<string, TaskDefinition>(ALL_TASKS.map((t) => [t.id, t]));

export function TaskPanel() {
  const { colors, space } = useTheme();
  const { state, startTasks, shutdownTask } = useDashboardController();
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);
  const [allocationModalId, setAllocationModalId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const taskEntries = Object.entries(state.tasks);
  const startable = ALL_TASKS.filter((def) => state.tasks[def.id] === undefined);

  const actions = <Button onClick={() => setNewTaskOpen(true)}>+ New task</Button>;

  const allocationSlot = allocationModalId ? state.tasks[allocationModalId] : undefined;
  const allocationDef = allocationModalId ? TASK_BY_ID.get(allocationModalId) : undefined;

  const closeNewTask = () => {
    setNewTaskOpen(false);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmNewTasks = () => {
    if (selectedIds.size > 0) startTasks(Array.from(selectedIds));
    closeNewTask();
  };

  return (
    <Panel title="Tasks" actions={actions} style={{ padding: space.md }}>
      {taskEntries.length === 0 ? (
        <span style={{ color: colors.muted }}>
          No active tasks — click <em>New task</em> to start one.
        </span>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: space.md }}>
          {taskEntries.map(([id, slot]) => (
            <TaskTile
              key={id}
              id={id}
              slot={slot}
              onInfo={() => setAllocationModalId(id)}
              onStop={() => setConfirmStopId(id)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmStopId !== null}
        title="Stop task?"
        message={
          confirmStopId
            ? `Request shutdown of "${confirmStopId}"? Its workers will wind down on their next yield.`
            : ""
        }
        confirmLabel="Stop"
        confirmVariant="warn"
        onCancel={() => setConfirmStopId(null)}
        onConfirm={() => {
          if (confirmStopId) shutdownTask(confirmStopId);
          setConfirmStopId(null);
        }}
      />

      <Modal
        open={newTaskOpen}
        onClose={closeNewTask}
        title="New task"
        actions={
          startable.length > 0 ? (
            <Button onClick={confirmNewTasks} disabled={selectedIds.size === 0}>
              Confirm
            </Button>
          ) : undefined
        }
      >
        {startable.length === 0 ? (
          <span style={{ color: colors.muted }}>All tasks are running.</span>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: space.md,
              maxWidth: 720,
            }}
          >
            {startable.map((def) => {
              const checked = selectedIds.has(def.id);
              return (
                <label
                  key={def.id}
                  style={{
                    border: `3px solid ${checked ? colors.accent : colors.fg}`,
                    background: colors.surface,
                    padding: space.md,
                    display: "flex",
                    flexDirection: "column",
                    gap: space.sm,
                    flex: "1 1 220px",
                    maxWidth: 240,
                    minWidth: 200,
                    cursor: "pointer",
                  }}
                >
                  <Row gap={space.sm} style={{ alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(def.id)}
                      style={{
                        accentColor: colors.accent,
                        cursor: "pointer",
                      }}
                    />
                    <span
                      style={{
                        color: colors.accent,
                        fontWeight: "bold",
                        fontSize: "1.15em",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {def.id}
                    </span>
                  </Row>
                  <span
                    style={{
                      color: colors.muted,
                      fontSize: "0.9em",
                      whiteSpace: "normal",
                      overflowWrap: "break-word",
                    }}
                  >
                    {def.description}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={allocationModalId !== null}
        onClose={() => setAllocationModalId(null)}
        title={allocationModalId ? `Allocation: ${allocationModalId}` : "Allocation"}
      >
        {allocationSlot && <AllocationDetails slot={allocationSlot} def={allocationDef} />}
      </Modal>
    </Panel>
  );
}

interface TaskTileProps {
  id: string;
  slot: TaskState;
  onInfo: () => void;
  onStop: () => void;
}

function TaskTile({ id, slot, onInfo, onStop }: TaskTileProps) {
  const { colors, space } = useTheme();
  const slices = slot.allocation?.servers ?? [];
  const ram = slices.reduce((sum, s) => sum + s.ram, 0);
  const canStop = slot.status === "running";
  const canInspect = slot.allocation !== null;

  const statusColor =
    slot.status === "running"
      ? colors.success
      : slot.status === "stopping"
        ? colors.warn
        : colors.accent;

  return (
    <div
      style={{
        border: `3px solid ${colors.fg}`,
        background: colors.surface,
        padding: space.md,
        display: "flex",
        flexDirection: "column",
        gap: space.sm,
        flex: "1 1 240px",
        maxWidth: 220,
        minWidth: 180,
      }}
    >
      <span
        style={{
          color: colors.accent,
          fontWeight: "bold",
          fontSize: "1.15em",
          letterSpacing: "0.02em",
        }}
      >
        {id}
      </span>
      <Row gap={space.sm} style={{ fontSize: "0.85em" }}>
        <span style={{ color: statusColor }}>{slot.status}</span>
        <Row>
          <span style={{ color: colors.muted }}>on {slot.host ?? "?"}</span>
          <span style={{ color: colors.muted, marginLeft: "auto" }}>• {ram}GB</span>
        </Row>
      </Row>
      <Row gap={space.sm} style={{ marginTop: "auto", justifyContent: "flex-end" }}>
        <Button onClick={onInfo} disabled={!canInspect}>
          <BracesIcon
            color={canInspect ? colors.accent : colors.muted}
            title="Allocation details"
          />
          Details
        </Button>
        <Button onClick={onStop} variant="warn" disabled={!canStop}>
          <PowerIcon color={canStop ? colors.warn : colors.muted} title={`Stop ${id}`} />
          Stop
        </Button>
      </Row>
    </div>
  );
}

function AllocationDetails({ slot, def }: { slot: TaskState; def: TaskDefinition | undefined }) {
  const { colors, space } = useTheme();
  const slices = slot.allocation?.servers ?? [];
  const totalRam = slices.reduce((sum, s) => sum + s.ram, 0);

  return (
    <Col gap={space.md}>
      {def && <span style={{ color: colors.fg }}>{def.description}</span>}
      <Row gap={space.lg}>
        <span style={{ color: colors.muted }}>
          Controller pid: <span style={{ color: colors.fg }}>{slot.pid ?? "—"}</span>
        </span>
        <span style={{ color: colors.muted }}>
          Host: <span style={{ color: colors.fg }}>{slot.host ?? "—"}</span>
        </span>
      </Row>
      <div
        style={{
          border: `1px solid ${colors.border}`,
          padding: space.sm,
          background: colors.surface,
        }}
      >
        <Col gap={space.xs}>
          <Row
            gap={space.md}
            style={{ borderBottom: `1px solid ${colors.fgDim}`, paddingBottom: space.xs }}
          >
            <span style={{ color: colors.muted, flex: 2 }}>hostname</span>
            <span style={{ color: colors.muted, flex: 1, textAlign: "right" }}>RAM (GB)</span>
            <span style={{ color: colors.muted, flex: 1, textAlign: "right" }}>cores</span>
          </Row>
          {slices.length === 0 ? (
            <span style={{ color: colors.muted }}>No allocation.</span>
          ) : (
            slices.map((s) => (
              <Row key={s.hostname} gap={space.md}>
                <span style={{ color: colors.fg, flex: 2 }}>{s.hostname}</span>
                <span style={{ color: colors.fg, flex: 1, textAlign: "right" }}>{s.ram}</span>
                <span style={{ color: colors.fg, flex: 1, textAlign: "right" }}>
                  {s.cores ?? "—"}
                </span>
              </Row>
            ))
          )}
        </Col>
      </div>
      <Row gap={space.lg}>
        <span style={{ color: colors.muted }}>
          Total: <span style={{ color: colors.fg }}>{totalRam}GB</span> across{" "}
          <span style={{ color: colors.fg }}>{slices.length}</span> host
          {slices.length === 1 ? "" : "s"}
        </span>
      </Row>
    </Col>
  );
}
