import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Col } from "../ui/Col";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { BracesIcon, PinIcon, PowerIcon, ShuffleIcon } from "../ui/Icons";
import { Modal } from "../ui/Modal";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { ALL_TASKS } from "../util/tasks/definitions/tasks";
import { HOME_RESERVED_RAM_GB, getTaskScriptPath } from "../util/tasks/taskManager";
import type { TaskDefinition, TaskState } from "../util/tasks/types";
import { Spinner } from "../ui/Spinner";
import { useNs } from "../util/ns";
import { TASK_CUSTOM_PANELS, hasCustomPanel } from "./taskCustomPanels";

const TASK_BY_ID = new Map<string, TaskDefinition>(ALL_TASKS.map((t) => [t.id, t]));

export function TaskPanel() {
  const { colors, space } = useTheme();
  const { state, startTasks, shutdownTask, shouldShowReallocate, reallocate } =
    useDashboardController();
  const ns = useNs();
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);
  const [allocationModalId, setAllocationModalId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());

  const taskEntries = Object.entries(state.tasks);
  const startable = ALL_TASKS.filter((def) => state.tasks[def.id] === undefined);

  // Drop pinned ids whose tasks have disappeared (e.g. stopped while pinned).
  useEffect(() => {
    setPinnedIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (state.tasks[id] !== undefined) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [state.tasks]);

  const pinnedEntries = taskEntries.filter(([id]) => pinnedIds.has(id) && hasCustomPanel(id));
  const gridEntries = taskEntries.filter(([id]) => !pinnedIds.has(id) || !hasCustomPanel(id));

  const pin = (id: string) =>
    setPinnedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const unpin = (id: string) =>
    setPinnedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const { totalRam, allottedRam } = useMemo(() => {
    let total = 0;
    for (const s of state.allServers) {
      if (!s.hasAdminRights || s.maxRam <= 0) continue;
      const reserved = s.hostname === "home" ? HOME_RESERVED_RAM_GB : 0;
      total += Math.max(0, s.maxRam - reserved);
    }
    let allotted = 0;
    for (const slot of Object.values(state.tasks)) {
      if (!slot.allocation) continue;
      for (const slice of slot.allocation.servers) allotted += slice.ram;
    }
    return { totalRam: total, allottedRam: allotted };
  }, [state.allServers, state.tasks]);

  const startableRam = useMemo(() => {
    const out = new Map<string, number>();
    for (const def of startable) {
      out.set(def.id, Math.ceil(ns.getScriptRam(getTaskScriptPath(def))));
    }
    return out;
  }, [startable, ns]);

  const showReallocate = shouldShowReallocate(state);
  const isReallocating = state.reallocating;

  const actions = (
    <Row gap={space.sm}>
      <span style={{ color: colors.muted, fontSize: "0.85em" }}>
        {`${ns.format.ram(allottedRam)} / ${ns.format.ram(totalRam)}`}
      </span>
      {isReallocating ? (
        <Row gap={space.sm} style={{ alignItems: "center", color: colors.muted }}>
          <Spinner active />
          <span style={{ fontSize: "0.85em" }}>Reallocating…</span>
        </Row>
      ) : (
        showReallocate && (
          <Button onClick={() => reallocate()} variant="primary">
            <ShuffleIcon
              color={colors.accent}
              title="Reallocate tasks to better utilize new server capacity. Will request shutdown from unbound tasks."
            />
            {" Reallocate"}
          </Button>
        )
      )}
      <Button onClick={() => setNewTaskOpen(true)} disabled={isReallocating}>
        + New task
      </Button>
    </Row>
  );

  const allocationSlot = allocationModalId ? state.tasks[allocationModalId] : undefined;
  const allocationDef = allocationModalId ? TASK_BY_ID.get(allocationModalId) : undefined;

  const closeNewTask = () => {
    setNewTaskOpen(false);
    setSelectedIds(new Set());
  };

  // Ports occupied by tasks that already exist in the manager state. These are
  // hard-blocked: a colliding startable can't be selected at all.
  const runningPorts = new Set<number>();
  for (const id of Object.keys(state.tasks)) {
    const port = TASK_BY_ID.get(id)?.communicationPort;
    if (port != null) runningPorts.add(port);
  }
  // Ports claimed by the user's current selection. A startable is blocked if
  // its port collides with a running task OR another currently-selected startable.
  const selectedPorts = new Set<number>();
  for (const id of selectedIds) {
    const port = TASK_BY_ID.get(id)?.communicationPort;
    if (port != null) selectedPorts.add(port);
  }

  const isPortBlocked = (def: TaskDefinition): boolean => {
    if (def.communicationPort == null) return false;
    if (runningPorts.has(def.communicationPort)) return true;
    // Don't let a def block itself.
    if (selectedIds.has(def.id)) return false;
    return selectedPorts.has(def.communicationPort);
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
        <Col gap={space.md}>
          {pinnedEntries.length > 0 && (
            <Col gap={space.md}>
              {pinnedEntries.map(([id, slot]) => (
                <PinnedTaskCard
                  key={id}
                  id={id}
                  slot={slot}
                  disableShutdown={isReallocating}
                  onInfo={() => setAllocationModalId(id)}
                  onStop={() => setConfirmStopId(id)}
                  onUnpin={() => unpin(id)}
                />
              ))}
            </Col>
          )}
          {gridEntries.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: space.md }}>
              {gridEntries.map(([id, slot]) => (
                <TaskTile
                  key={id}
                  id={id}
                  slot={slot}
                  canPin={hasCustomPanel(id)}
                  disableShutdown={isReallocating}
                  onInfo={() => setAllocationModalId(id)}
                  onStop={() => setConfirmStopId(id)}
                  onPin={() => pin(id)}
                />
              ))}
            </div>
          )}
        </Col>
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
        style={{ minWidth: 800 }}
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
          <Col gap={space.lg}>
            {[...new Set(startable.map((def) => def.category))].sort().map((category) => {
              const inCategory = startable.filter((def) => def.category === category);
              return (
                <Col key={category} gap={space.sm}>
                  <div
                    style={{
                      color: colors.muted,
                      borderBottom: `1px solid ${colors.fgDim}`,
                      paddingBottom: space.xs,
                      fontSize: "0.8em",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {category}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: space.md }}>
                    {inCategory.map((def) => {
                      const checked = selectedIds.has(def.id);
                      const blocked = isPortBlocked(def);
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
                            cursor: blocked ? "not-allowed" : "pointer",
                            opacity: blocked ? 0.5 : 1,
                          }}
                        >
                          <Row gap={space.sm} style={{ alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={blocked}
                              onChange={() => {
                                if (blocked) return;
                                toggleSelected(def.id);
                              }}
                              style={{
                                accentColor: colors.accent,
                                cursor: blocked ? "not-allowed" : "pointer",
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
                              {def.icon}
                              {def.id}
                            </span>
                          </Row>
                          <span
                            style={{
                              color: colors.muted,
                              fontSize: "0.85em",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {(() => {
                              const entry = startableRam.get(def.id) ?? 0;
                              if (!def.demand.unbounded) return ns.format.ram(entry);
                              const cap = def.demand.maxRamDemand;
                              const upper = cap == null ? "∞" : ns.format.ram(cap);
                              return `from ${ns.format.ram(entry)} to ${upper}`;
                            })()}
                          </span>
                          <span
                            style={{
                              color: colors.fg,
                              fontSize: "0.9em",
                              whiteSpace: "normal",
                              overflowWrap: "break-word",
                            }}
                          >
                            {def.description}
                          </span>
                          {blocked && (
                            <span style={{ color: colors.warn, fontSize: "0.85em" }}>
                              conflicts with other task
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </Col>
              );
            })}
          </Col>
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
  canPin: boolean;
  disableShutdown?: boolean;
  onInfo: () => void;
  onStop: () => void;
  onPin: () => void;
}

function TaskTile({ id, slot, canPin, disableShutdown, onInfo, onStop, onPin }: TaskTileProps) {
  const { colors, space } = useTheme();
  const ns = useNs();

  const slices = slot.allocation?.servers ?? [];
  const ram = slices.reduce((sum, s) => sum + s.ram, 0);
  const canStop = slot.status === "running" && !disableShutdown;
  const canInspect = slot.allocation !== null;

  const statusColor =
    slot.status === "running"
      ? colors.muted
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
      <Row>
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
        {slot.status === "running" && <Spinner active />}
      </Row>
      <Row gap={space.sm} style={{ fontSize: "0.85em" }}>
        <span style={{ color: statusColor }}>{slot.status}</span>
        <Row>
          <span style={{ color: colors.muted }}>on {slot.host ?? "?"}</span>
          <span style={{ color: colors.muted, marginLeft: "auto" }}>• {ns.format.ram(ram)}</span>
        </Row>
      </Row>
      <Row gap={space.sm} style={{ marginTop: "auto", justifyContent: "flex-end" }}>
        {canPin && (
          <Button onClick={onPin}>
            <PinIcon color={colors.accent} title={`Pin ${id}`} />
          </Button>
        )}
        <Button onClick={onInfo} disabled={!canInspect}>
          <BracesIcon
            color={canInspect ? colors.accent : colors.muted}
            title="Allocation details"
          />
        </Button>
        <Button onClick={onStop} variant="warn" disabled={!canStop}>
          <PowerIcon color={canStop ? colors.warn : colors.muted} title={`Stop ${id}`} />
        </Button>
      </Row>
    </div>
  );
}

interface PinnedTaskCardProps {
  id: string;
  slot: TaskState;
  disableShutdown?: boolean;
  onInfo: () => void;
  onStop: () => void;
  onUnpin: () => void;
}

function PinnedTaskCard({
  id,
  slot,
  disableShutdown,
  onInfo,
  onStop,
  onUnpin,
}: PinnedTaskCardProps) {
  const { colors, space } = useTheme();
  const ns = useNs();

  const Custom = TASK_CUSTOM_PANELS[id];
  const slices = slot.allocation?.servers ?? [];
  const ram = slices.reduce((sum, s) => sum + s.ram, 0);
  const canStop = slot.status === "running" && !disableShutdown;
  const canInspect = slot.allocation !== null;

  const statusColor =
    slot.status === "running"
      ? colors.muted
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
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <Row gap={space.md}>
        <Row gap={space.sm}>
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
          {slot.status === "running" && <Spinner active />}
        </Row>
        <Row gap={space.sm} style={{ fontSize: "0.85em", marginLeft: space.lg }}>
          <span style={{ color: statusColor }}>{slot.status}</span>
          <span style={{ color: colors.muted }}>on {slot.host ?? "?"}</span>
          <span style={{ color: colors.muted }}>• {ns.format.ram(ram)}</span>
        </Row>
        <Row gap={space.sm} style={{ marginLeft: "auto" }}>
          <Button onClick={onUnpin}>
            <PinIcon color={colors.accent} title={`Unpin ${id}`} />
          </Button>
          <Button onClick={onInfo} disabled={!canInspect}>
            <BracesIcon
              color={canInspect ? colors.accent : colors.muted}
              title="Allocation details"
            />
          </Button>
          <Button onClick={onStop} variant="warn" disabled={!canStop}>
            <PowerIcon color={canStop ? colors.warn : colors.muted} title={`Stop ${id}`} />
          </Button>
        </Row>
      </Row>
      {Custom && (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            padding: space.md,
            minHeight: 80,
          }}
        >
          <Custom id={id} slot={slot} />
        </div>
      )}
    </div>
  );
}

function AllocationDetails({ slot, def }: { slot: TaskState; def: TaskDefinition | undefined }) {
  const { colors, space } = useTheme();
  const ns = useNs();
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
            <span style={{ color: colors.muted, flex: 1, textAlign: "right" }}>RAM</span>
            <span style={{ color: colors.muted, flex: 1, textAlign: "right" }}>cores</span>
          </Row>
          {slices.length === 0 ? (
            <span style={{ color: colors.muted }}>No allocation.</span>
          ) : (
            slices.map((s) => (
              <Row key={s.hostname} gap={space.md}>
                <span style={{ color: colors.fg, flex: 2 }}>{s.hostname}</span>
                <span style={{ color: colors.fg, flex: 1, textAlign: "right" }}>
                  {ns.format.ram(s.ram)}
                </span>
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
          Total: <span style={{ color: colors.fg }}>{ns.format.ram(totalRam)}</span> across{" "}
          <span style={{ color: colors.fg }}>{slices.length}</span> host
          {slices.length === 1 ? "" : "s"}
        </span>
      </Row>
    </Col>
  );
}
