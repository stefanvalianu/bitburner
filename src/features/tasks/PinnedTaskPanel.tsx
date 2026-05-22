import { TaskId, TaskState } from "@repo/common/tasks/types";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";
import { TASK_CUSTOM_PANELS } from "@repo/tasks";
import { Row } from "@repo/features/components/Row";
import { Button } from "@repo/features/components/Button";
import { PinIcon, PowerIcon } from "@repo/features/components/Icons";
import { Spinner } from "@repo/features/components/Spinner";

type Props = {
  id: TaskId;
  state: TaskState;
  disableShutdown?: boolean;
  onStop: (id: TaskId) => void;
  onUnpin: (id: TaskId) => void;
}

export function PinnedTaskPanel({
  id,
  state,
  disableShutdown,
  onStop,
  onUnpin,
}: Props) {
  const theme = useTheme();
  const ns = useNs();

  const Custom = TASK_CUSTOM_PANELS[id];
  const slices = state.allocation?.servers ?? [];
  const ram = slices.reduce((sum, s) => sum + s.ram, 0);
  const canStop = state.status === "running" && !disableShutdown;
  const canInspect = state.allocation !== null;

  const statusColor =
    state.status === "running"
      ? theme.colors.secondary
      : state.status === "stopping"
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
          {state.status === "running" && <Spinner active />}
        </Row>
        <Row gap={theme.spacing.sm} style={{ fontSize: "0.85em", marginLeft: theme.spacing.lg }}>
          <span style={{ color: statusColor }}>{state.status}</span>
          <span style={{ color: theme.colors.secondary }}>on {state.host ?? "?"}</span>
          <span style={{ color: theme.colors.secondary }}>• {ns.format.ram(ram)}</span>
        </Row>
        <Row gap={theme.spacing.sm} style={{ marginLeft: "auto" }}>
          <Button onClick={() => onUnpin(id)}>
            <PinIcon color={theme.colors.info} title={`Unpin ${id}`} />
          </Button>
          <Button onClick={() => onStop(id)} variant="error" disabled={!canStop}>
            <PowerIcon color={canStop ? theme.colors.hp : theme.colors.secondary} title={`Stop ${id}`} />
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
          <Custom id={id} slot={state} />
        </div>
      )}
    </div>
  );
}
