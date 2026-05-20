import { useEffect, useMemo, useState } from "react";
import { Button } from "@repo/features/components/Button";
import { Col } from "@repo/features/components/Col";
import { ConfirmDialog } from "@repo/features/components/ConfirmDialog";
import { BracesIcon, PinIcon, PowerIcon, ShuffleIcon } from "@repo/features/components/Icons";
import { Modal } from "@repo/features/components/Modal";
import { Panel } from "@repo/features/components/Panel";
import { Row } from "@repo/features/components/Row";
import { useDashboardController } from "@repo/features/useDashboardController";
import {
  ALL_TASKS,
  hasCustomPanel,
  TASK_BY_ID,
  TASK_CUSTOM_PANELS,
} from "@repo/lib/util/tasks/definitions/tasks";
import { HOME_RESERVED_RAM_GB, getTaskScriptPath } from "@repo/common/tasks/taskManager";
import type { TaskDefinition, TaskState } from "@repo/common/tasks/types";
import { Spinner } from "@repo/features/components/Spinner";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";

export function TaskPanel() {
  const theme = useTheme();
  const { state, startTasks, shutdownTask, shouldShowReallocate, reallocate } =
    useDashboardController();
  const ns = useNs();
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);
  const [allocationModalId, setAllocationModalId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());

  const taskEntries = Object.entries(state.tasks);
  const startable = ALL_TASKS.filter((def) => {
    if (state.tasks[def.id] !== undefined) return false;
    return true;
  });

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
    <Row gap={theme.spacing.sm}>
      <span style={{ color: theme.colors.secondary, fontSize: "0.85em" }}>
        {`${ns.format.ram(allottedRam)} / ${ns.format.ram(totalRam)}`}
      </span>
      {isReallocating ? (
        <Row gap={theme.spacing.sm} style={{ alignItems: "center", color: theme.colors.secondary }}>
          <Spinner active />
          <span style={{ fontSize: "0.85em" }}>Reallocating…</span>
        </Row>
      ) : (
        showReallocate && (
          <Button onClick={() => reallocate()} variant="primary">
            <ShuffleIcon
              color={theme.colors.info}
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
    <Panel title="Tasks" actions={actions} style={{ padding: theme.spacing.md }}>
      {taskEntries.length === 0 ? (
        <span style={{ color: theme.colors.secondary }}>
          No active tasks — click <em>New task</em> to start one.
        </span>
      ) : (
        <Col gap={theme.spacing.md}>
          {pinnedEntries.length > 0 && (
            <Col gap={theme.spacing.md}>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: theme.spacing.md }}>
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
          <span style={{ color: theme.colors.secondary }}>All tasks are running.</span>
        ) : (
          <Col gap={theme.spacing.lg}>
            {[...new Set(startable.map((def) => def.category))].sort().map((category) => {
              const inCategory = startable.filter((def) => def.category === category);
              return (
                <Col key={category} gap={theme.spacing.sm}>
                  <div
                    style={{
                      color: theme.colors.secondary,
                      borderBottom: `1px solid ${theme.colors.primarydark}`,
                      paddingBottom: theme.spacing.xs,
                      fontSize: "0.8em",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {category}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: theme.spacing.md }}>
                    {inCategory.map((def) => {
                      const checked = selectedIds.has(def.id);
                      let requirementsNotMetReason: string | undefined = undefined;
                      if (def.checkRequirements)
                        requirementsNotMetReason = def.checkRequirements(state);

                      const blocked = isPortBlocked(def) || requirementsNotMetReason !== undefined;
                      return (
                        <label
                          key={def.id}
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
                            cursor: blocked ? "not-allowed" : "pointer",
                            opacity: blocked ? 0.5 : 1,
                          }}
                        >
                          <Row gap={theme.spacing.sm} style={{ alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={blocked}
                              onChange={() => {
                                if (blocked) return;
                                toggleSelected(def.id);
                              }}
                              style={{
                                accentColor: theme.colors.info,
                                cursor: blocked ? "not-allowed" : "pointer",
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
                              {def.icon}
                              {def.id}
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
                              const entry = startableRam.get(def.id) ?? 0;
                              if (!def.demand.unbounded) return ns.format.ram(entry);
                              const cap = def.demand.maxRamDemand;
                              const upper = cap == null ? "∞" : ns.format.ram(cap);
                              return `from ${ns.format.ram(entry)} to ${upper}`;
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
                            {def.description}
                          </span>
                          {blocked && (
                            <span style={{ color: theme.colors.warning, fontSize: "0.85em" }}>
                              {requirementsNotMetReason || "conflicts with other task"}
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
  const theme = useTheme();
  const ns = useNs();

  const slices = slot.allocation?.servers ?? [];
  const ram = slices.reduce((sum, s) => sum + s.ram, 0);
  const canStop = slot.status === "running" && !disableShutdown;
  const canInspect = slot.allocation !== null;

  const statusColor =
    slot.status === "running"
      ? theme.colors.secondary
      : slot.status === "stopping"
        ? theme.colors.warning
        : theme.colors.info;

  return (
    <div
      style={{
        border: `3px solid ${theme.colors.primary}`,
        background: theme.colors.backgroundsecondary,
        padding: theme.spacing.md,
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing.sm,
        flex: "1 1 240px",
        maxWidth: 220,
        minWidth: 180,
      }}
    >
      <Row>
        <span
          style={{
            color: theme.colors.info,
            fontWeight: "bold",
            fontSize: "1.15em",
            letterSpacing: "0.02em",
          }}
        >
          {id}
        </span>
        {slot.status === "running" && <Spinner active />}
      </Row>
      <Row gap={theme.spacing.sm} style={{ fontSize: "0.85em" }}>
        <span style={{ color: statusColor }}>{slot.status}</span>
        <Row>
          <span style={{ color: theme.colors.secondary }}>on {slot.host ?? "?"}</span>
          <span style={{ color: theme.colors.secondary, marginLeft: "auto" }}>• {ns.format.ram(ram)}</span>
        </Row>
      </Row>
      <Row gap={theme.spacing.sm} style={{ marginTop: "auto", justifyContent: "flex-end" }}>
        {canPin && (
          <Button onClick={onPin}>
            <PinIcon color={theme.colors.info} title={`Pin ${id}`} />
          </Button>
        )}
        <Button onClick={onInfo} disabled={!canInspect}>
          <BracesIcon
            color={canInspect ? theme.colors.info : theme.colors.secondary}
            title="Allocation details"
          />
        </Button>
        <Button onClick={onStop} variant="warn" disabled={!canStop}>
          <PowerIcon color={canStop ? theme.colors.warning : theme.colors.secondary} title={`Stop ${id}`} />
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
  const theme = useTheme();
  const ns = useNs();

  const Custom = TASK_CUSTOM_PANELS[id];
  const slices = slot.allocation?.servers ?? [];
  const ram = slices.reduce((sum, s) => sum + s.ram, 0);
  const canStop = slot.status === "running" && !disableShutdown;
  const canInspect = slot.allocation !== null;

  const statusColor =
    slot.status === "running"
      ? theme.colors.secondary
      : slot.status === "stopping"
        ? theme.colors.warning
        : theme.colors.info;

  return (
    <div
      style={{
        border: `3px solid ${theme.colors.primary}`,
        background: theme.colors.backgroundsecondary,
        padding: theme.spacing.md,
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing.sm,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <Row gap={theme.spacing.md}>
        <Row gap={theme.spacing.sm}>
          <span
            style={{
              color: theme.colors.info,
              fontWeight: "bold",
              fontSize: "1.15em",
              letterSpacing: "0.02em",
            }}
          >
            {id}
          </span>
          {slot.status === "running" && <Spinner active />}
        </Row>
        <Row gap={theme.spacing.sm} style={{ fontSize: "0.85em", marginLeft: theme.spacing.lg }}>
          <span style={{ color: statusColor }}>{slot.status}</span>
          <span style={{ color: theme.colors.secondary }}>on {slot.host ?? "?"}</span>
          <span style={{ color: theme.colors.secondary }}>• {ns.format.ram(ram)}</span>
        </Row>
        <Row gap={theme.spacing.sm} style={{ marginLeft: "auto" }}>
          <Button onClick={onUnpin}>
            <PinIcon color={theme.colors.info} title={`Unpin ${id}`} />
          </Button>
          <Button onClick={onInfo} disabled={!canInspect}>
            <BracesIcon
              color={canInspect ? theme.colors.info : theme.colors.secondary}
              title="Allocation details"
            />
          </Button>
          <Button onClick={onStop} variant="warn" disabled={!canStop}>
            <PowerIcon color={canStop ? theme.colors.warning : theme.colors.secondary} title={`Stop ${id}`} />
          </Button>
        </Row>
      </Row>
      {Custom && (
        <div
          style={{
            border: `1px solid ${theme.colors.welllight}`,
            padding: theme.spacing.md,
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
  const theme = useTheme();
  const ns = useNs();
  const slices = slot.allocation?.servers ?? [];
  const totalRam = slices.reduce((sum, s) => sum + s.ram, 0);

  return (
    <Col gap={theme.spacing.md}>
      {def && <span style={{ color: theme.colors.primary }}>{def.description}</span>}
      <Row gap={theme.spacing.lg}>
        <span style={{ color: theme.colors.secondary }}>
          Controller pid: <span style={{ color: theme.colors.primary }}>{slot.pid ?? "—"}</span>
        </span>
        <span style={{ color: theme.colors.secondary }}>
          Host: <span style={{ color: theme.colors.primary }}>{slot.host ?? "—"}</span>
        </span>
      </Row>
      <div
        style={{
          border: `1px solid ${theme.colors.welllight}`,
          padding: theme.spacing.sm,
          background: theme.colors.backgroundsecondary,
        }}
      >
        <Col gap={theme.spacing.xs}>
          <Row
            gap={theme.spacing.md}
            style={{ borderBottom: `1px solid ${theme.colors.primarydark}`, paddingBottom: theme.spacing.xs }}
          >
            <span style={{ color: theme.colors.secondary, flex: 2 }}>hostname</span>
            <span style={{ color: theme.colors.secondary, flex: 1, textAlign: "right" }}>RAM</span>
            <span style={{ color: theme.colors.secondary, flex: 1, textAlign: "right" }}>cores</span>
          </Row>
          {slices.length === 0 ? (
            <span style={{ color: theme.colors.secondary }}>No allocation.</span>
          ) : (
            slices.map((s) => (
              <Row key={s.hostname} gap={theme.spacing.md}>
                <span style={{ color: theme.colors.primary, flex: 2 }}>{s.hostname}</span>
                <span style={{ color: theme.colors.primary, flex: 1, textAlign: "right" }}>
                  {ns.format.ram(s.ram)}
                </span>
                <span style={{ color: theme.colors.primary, flex: 1, textAlign: "right" }}>
                  {s.cores ?? "—"}
                </span>
              </Row>
            ))
          )}
        </Col>
      </div>
      <Row gap={theme.spacing.lg}>
        <span style={{ color: theme.colors.secondary }}>
          Total: <span style={{ color: theme.colors.primary }}>{ns.format.ram(totalRam)}</span> across{" "}
          <span style={{ color: theme.colors.primary }}>{slices.length}</span> host
          {slices.length === 1 ? "" : "s"}
        </span>
      </Row>
    </Col>
  );
}
