import { useEffect, useState } from "react";
import {
  TASK_EVENTS_PORT,
  DASHBOARD_STATE_PORT,
  HACKING_SYSTEM_COMMUNICATION_PORT,
} from "@repo/common/ports";
import { Button } from "./Button";
import { Col } from "./Col";
import { BracesIcon } from "./Icons";
import { JsonView } from "./JsonView";
import { Modal } from "./Modal";
import { Row } from "./Row";
import { useNs } from "@repo/features/ns/NsProvider";
import { useTheme } from "@repo/features/theme/ThemeProvider";

interface PortDescriptor {
  port: number;
  name: string;
  semantics: "latest" | "queue";
  description: string;
}

// Ports listed in the viewer. LOG_PORT is intentionally excluded — it has its
// own dedicated stream UI (LogButton + LogStream).
const PORTS: PortDescriptor[] = [
  {
    port: DASHBOARD_STATE_PORT,
    name: "Dashboard state",
    semantics: "latest",
    description: "Source of truth for the state used in all processing..",
  },
  {
    port: TASK_EVENTS_PORT,
    name: "Task events",
    semantics: "queue",
    description: "Queue of events sent from tasks to the task manager.",
  },
  {
    port: HACKING_SYSTEM_COMMUNICATION_PORT,
    name: "Hack commands",
    semantics: "queue",
    description: "Queue of command sent from the user to the hacking system.",
  },
];

const POLL_MS = 500;

interface Snapshot {
  raw: string | null;
  parsed: unknown;
  error: string | null;
}

const EMPTY: Snapshot = { raw: null, parsed: null, error: null };

export function PortViewerButton() {
  const ns = useNs();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [activePort, setActivePort] = useState<number>(PORTS[0].port);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);

  useEffect(() => {
    if (!open) return;
    const handle = ns.getPortHandle(activePort);
    const tick = () => {
      const raw = handle.peek();
      if (raw === "NULL PORT DATA") {
        setSnapshot(EMPTY);
        return;
      }
      if (typeof raw === "string") {
        try {
          setSnapshot({ raw, parsed: JSON.parse(raw), error: null });
        } catch (e) {
          setSnapshot({ raw, parsed: null, error: (e as Error).message });
        }
      } else {
        // Non-string payload: show it directly without re-parsing.
        setSnapshot({ raw: JSON.stringify(raw), parsed: raw, error: null });
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [open, activePort, ns]);

  const active = PORTS.find((p) => p.port === activePort) ?? PORTS[0];

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <BracesIcon color={theme.colors.secondary} />
        Ports
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Ports · ${active.name} (#${active.port})`}
      >
        <Col gap={theme.spacing.md} style={{ minWidth: 560 }}>
          <Row gap={theme.spacing.sm}>
            {PORTS.map((p) => {
              const isActive = p.port === activePort;
              return (
                <button
                  key={p.port}
                  onClick={() => setActivePort(p.port)}
                  style={{
                    fontFamily: theme.font.face,
                    background: isActive ? theme.colors.well : theme.colors.backgroundprimary,
                    color: isActive ? theme.colors.info : theme.colors.primary,
                    border: `1px solid ${isActive ? theme.colors.info : theme.colors.welllight}`,
                    padding: `${theme.spacing.xs}px ${theme.spacing.md}px`,
                    cursor: "pointer",
                  }}
                >
                  {p.name} (#{p.port})
                </button>
              );
            })}
          </Row>
          <span style={{ color: theme.colors.secondary, fontSize: 11 }}>
            {active.semantics} · {active.description}
          </span>
          <div
            style={{
              border: `1px solid ${theme.colors.welllight}`,
              padding: theme.spacing.md,
              background: theme.colors.well,
              maxHeight: 480,
              overflow: "auto",
              minWidth: 480,
            }}
          >
            {snapshot.error ? (
              <Col gap={theme.spacing.xs}>
                <span style={{ color: theme.colors.error }}>parse error: {snapshot.error}</span>
                <span style={{ color: theme.colors.secondary, fontSize: 11 }}>raw:</span>
                <pre style={{ color: theme.colors.primary, fontSize: 11, margin: 0 }}>{snapshot.raw}</pre>
              </Col>
            ) : snapshot.raw === null ? (
              <span style={{ color: theme.colors.secondary }}>(empty — no data on port)</span>
            ) : (
              <JsonView value={snapshot.parsed} defaultExpandDepth={2} />
            )}
          </div>
        </Col>
      </Modal>
    </>
  );
}
