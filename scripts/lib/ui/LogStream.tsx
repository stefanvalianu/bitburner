import { useEffect, useMemo, useRef, useState } from "react";
import { type LogEntry, type LogLevel } from "../util/log";
import { Badge } from "./Badge";
import { Col } from "./Col";
import { useNs } from "../util/ns";
import { Row } from "./Row";
import { useTheme } from "./theme";
import { LOG_PORT } from "../util/ports";

const MAX_BUFFER = 250;
const POLL_MS = 200;

const levelSeverity: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function ts(t: number): string {
  const d = new Date(t);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

// Drains LOG_PORT on a fixed interval, keeping the most recent MAX_BUFFER
// entries. onFresh fires once per poll that produced new entries, with the
// highest-severity entry from that batch — useful for badging the trigger
// that opens the log view.
export function useLogStream(onFresh?: (top: LogEntry) => void): LogEntry[] {
  const ns = useNs();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const onFreshRef = useRef(onFresh);
  onFreshRef.current = onFresh;

  useEffect(() => {
    const port = ns.getPortHandle(LOG_PORT);
    const id = setInterval(() => {
      const fresh: LogEntry[] = [];
      while (!port.empty()) {
        const raw = port.read();
        if (typeof raw !== "string" || raw === "NULL PORT DATA") break;
        try {
          fresh.push(JSON.parse(raw) as LogEntry);
        } catch {
          // Drop malformed entries silently — better than nuking the viewer.
        }
      }
      if (fresh.length > 0) {
        setEntries((prev) => [...prev, ...fresh].slice(-MAX_BUFFER));
        const top = fresh.reduce((a, b) =>
          levelSeverity[b.level] > levelSeverity[a.level] ? b : a,
        );
        onFreshRef.current?.(top);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [ns]);

  return entries;
}

// Maps log levels to theme colors. Exposed so callers (e.g., a dashboard
// notification dot) can match the color of the most-recent log severity.
export function useLevelColor(): Record<LogLevel, string> {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      debug: colors.muted,
      info: colors.fg,
      warn: colors.warn,
      error: colors.error,
    }),
    [colors],
  );
}

interface LogStreamProps {
  entries: LogEntry[];
}

export function LogStream({ entries }: LogStreamProps) {
  const { colors, space } = useTheme();
  const levelColor = useLevelColor();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  if (entries.length === 0) {
    return <span style={{ color: colors.muted }}>waiting for logs… (port {LOG_PORT})</span>;
  }
  return (
    <Col gap={2} style={{ maxHeight: 400, overflowY: "auto", minWidth: 520 }}>
      {entries.map((e, i) => (
        <Row key={i} gap={space.sm} align="baseline">
          <span style={{ color: colors.muted, fontSize: 10, minWidth: 90 }}>{ts(e.ts)}</span>
          <Badge color={levelColor[e.level]}>{e.level}</Badge>
          <span style={{ color: colors.muted, minWidth: 80 }}>{e.source}</span>
          <span style={{ color: levelColor[e.level] }}>{e.msg}</span>
          {e.data !== undefined && (
            <span style={{ color: colors.muted }}>{JSON.stringify(e.data)}</span>
          )}
        </Row>
      ))}
      <div ref={endRef} />
    </Col>
  );
}
