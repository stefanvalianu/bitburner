import { useEffect, useMemo, useRef, useState } from "react";
import type { NS } from "@ns";
import { LOG_PORT, type LogEntry, type LogLevel } from "./lib/log";
import {
  Badge,
  Col,
  NotificationDot,
  Panel,
  Row,
  ThemeProvider,
  useNotification,
  useTheme,
} from "./lib/ui";

const MAX_BUFFER = 250;
const POLL_MS = 200;

const levelSeverity: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function ts(t: number): string {
  const d = new Date(t);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function LogStream({ ns }: { ns: NS }) {
  const { colors, space } = useTheme();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const { notification, notify } = useNotification();

  const levelColor = useMemo<Record<LogLevel, string>>(
    () => ({
      debug: colors.muted,
      info: colors.fg,
      warn: colors.warn,
      error: colors.error,
    }),
    [colors],
  );

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
        // Notify with the highest-severity color in the batch — error wins
        // over warn wins over info wins over debug.
        const top = fresh.reduce((a, b) =>
          levelSeverity[b.level] > levelSeverity[a.level] ? b : a,
        );
        notify(levelColor[top.level]);
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [ns, notify, levelColor]);

  // Auto-scroll on new entries, and reflect the count + notification dot in
  // the tail title bar so it's readable even when the window is collapsed.
  // setTailTitle renders in a separate React root so the title needs its own
  // ThemeProvider — context does not propagate across roots.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
    ns.ui.setTailTitle(
      <ThemeProvider ns={ns}>
        &nbsp;
        {notification && <NotificationDot color={notification.color} />}
        logs · {entries.length}/{MAX_BUFFER}
      </ThemeProvider>,
    );
  }, [entries.length, notification, ns]);

  return (
    <Panel title={`logs · ${entries.length}/${MAX_BUFFER}`} style={{ minWidth: 520, maxHeight: 500, overflowY: "auto" }}>
      {entries.length === 0 ? (
        <span style={{ color: colors.muted }}>waiting for logs… (port {LOG_PORT})</span>
      ) : (
        <Col gap={2}>
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
      )}
    </Panel>
  );
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.clearLog();
  ns.ui.openTail();
  ns.printRaw(
    <ThemeProvider ns={ns}>
      <LogStream ns={ns} />
    </ThemeProvider>,
  );
  while (true) await ns.asleep(60_000);
}
