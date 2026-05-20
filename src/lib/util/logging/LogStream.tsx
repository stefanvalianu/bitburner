import { useEffect, useMemo, useRef, useState } from "react";
import { type LogEntry, type LogLevel } from "./log";
import { Badge } from "../../../features/components/Badge";
import { Col } from "../../../features/components/Col";
import { Row } from "../../../features/components/Row";
import { LOG_PORT } from "../ports";
import { useNs } from "../../../features/ns/NsProvider";
import { useTheme } from "../../../features/theme/ThemeProvider";

const MAX_BUFFER = 250;
const POLL_MS = 1000;

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
  const theme = useTheme();
  return useMemo(
    () => ({
      debug: theme.colors.secondary,
      info: theme.colors.primary,
      warn: theme.colors.warning,
      error: theme.colors.error,
    }),
    [theme],
  );
}

interface LogStreamProps {
  entries: LogEntry[];
}

export function LogStream({ entries }: LogStreamProps) {
  const theme = useTheme();
  const levelColor = useLevelColor();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length]);

  if (entries.length === 0) {
    return <span style={{ color: theme.colors.secondary }}>waiting for logs… (port {LOG_PORT})</span>;
  }
  return (
    <Col gap={2} style={{ maxHeight: 400, overflowY: "auto", minWidth: 520 }}>
      {entries.map((e, i) => (
        <Row key={i} gap={theme.spacing.sm} align="baseline">
          <span style={{ color: theme.colors.secondary, fontSize: 10, minWidth: 90 }}>{ts(e.ts)}</span>
          <Badge color={levelColor[e.level]}>{e.level}</Badge>
          <span style={{ color: theme.colors.secondary, minWidth: 80 }}>{e.source}</span>
          <span style={{ color: levelColor[e.level] }}>{e.msg}</span>
          {e.data !== undefined && (
            <span style={{ color: theme.colors.secondary }}>{JSON.stringify(e.data)}</span>
          )}
        </Row>
      ))}
      <div ref={endRef} />
    </Col>
  );
}
