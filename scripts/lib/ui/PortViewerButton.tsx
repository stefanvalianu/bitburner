import { useEffect, useState } from "react";
import { BracesIcon, Button, Col, JsonView, Modal, Row, useTheme } from ".";
import { useNs } from "../util/ns";
import { TASK_EVENTS_PORT, DASHBOARD_STATE_PORT } from "../util/ports";

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
    description: "FIFO of TaskEvents drained each tick — head only, often empty.",
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
  const { colors, fonts, space } = useTheme();
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
        <BracesIcon color={colors.muted} />
        Ports
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Ports · ${active.name} (#${active.port})`}
      >
        <Col gap={space.md} style={{ minWidth: 560 }}>
          <Row gap={space.sm}>
            {PORTS.map((p) => {
              const isActive = p.port === activePort;
              return (
                <button
                  key={p.port}
                  onClick={() => setActivePort(p.port)}
                  style={{
                    fontFamily: fonts.mono,
                    background: isActive ? colors.well : colors.bg,
                    color: isActive ? colors.accent : colors.fg,
                    border: `1px solid ${isActive ? colors.accent : colors.border}`,
                    padding: `${space.xs}px ${space.md}px`,
                    cursor: "pointer",
                  }}
                >
                  {p.name} (#{p.port})
                </button>
              );
            })}
          </Row>
          <span style={{ color: colors.muted, fontSize: 11 }}>
            {active.semantics} · {active.description}
          </span>
          <div
            style={{
              border: `1px solid ${colors.border}`,
              padding: space.md,
              background: colors.well,
              maxHeight: 480,
              overflow: "auto",
              minWidth: 480,
            }}
          >
            {snapshot.error ? (
              <Col gap={space.xs}>
                <span style={{ color: colors.error }}>parse error: {snapshot.error}</span>
                <span style={{ color: colors.muted, fontSize: 11 }}>raw:</span>
                <pre style={{ color: colors.fg, fontSize: 11, margin: 0 }}>{snapshot.raw}</pre>
              </Col>
            ) : snapshot.raw === null ? (
              <span style={{ color: colors.muted }}>(empty — no data on port)</span>
            ) : (
              <JsonView value={snapshot.parsed} defaultExpandDepth={2} />
            )}
          </div>
        </Col>
      </Modal>
    </>
  );
}
