import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";
import { TaskId, TaskState } from "@repo/common/tasks/types";
import { Row } from "@repo/features/components/Row";
import { Spinner } from "@repo/features/components/Spinner";
import { Button } from "@repo/features/components/Button";
import { PinIcon, PowerIcon } from "@repo/features/components/Icons";

type Props = {
  id: TaskId;
  state: TaskState;
  canPin: boolean;
  disableShutdown?: boolean;
  onStop: (id: TaskId) => void;
  onPin: (id: TaskId) => void;
}

export function TaskTile({ id, state, canPin, disableShutdown, onStop, onPin }: Props) {
  const theme = useTheme();
  const ns = useNs();

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
        {state.status === "running" && <Spinner active />}
      </Row>
      <Row gap={theme.spacing.sm} style={{ fontSize: "0.85em" }}>
        <span style={{ color: statusColor }}>{state.status}</span>
        <Row>
          <span style={{ color: theme.colors.secondary }}>on {state.host ?? "?"}</span>
          <span style={{ color: theme.colors.secondary, marginLeft: "auto" }}>• {ns.format.ram(ram)}</span>
        </Row>
      </Row>
      <Row gap={theme.spacing.sm} style={{ marginTop: "auto", justifyContent: "flex-end" }}>
        {canPin && (
          <Button onClick={() => onPin(id)}>
            <PinIcon color={theme.colors.info} title={`Pin ${id}`} />
          </Button>
        )}
        <Button onClick={() => onStop(id)} variant="warn" disabled={!canStop}>
          <PowerIcon color={canStop ? theme.colors.warning : theme.colors.secondary} title={`Stop ${id}`} />
        </Button>
      </Row>
    </div>
  );
}
