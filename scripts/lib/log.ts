import { useMemo } from "react";
import type { NS } from "@ns";
import { useNs } from "./ns";

// Shared port between producers (any script that logs) and the consumer
// (scripts/tail-logs.tsx). Bitburner ports are FIFO with bounded capacity;
// when full, oldest entries get evicted — fine for an unbounded log stream
// when no viewer happens to be running.
export const LOG_PORT = 1;

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  source: string;
  msg: string;
  data?: unknown;
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export function createLogger(ns: NS, source: string): Logger {
  const port = ns.getPortHandle(LOG_PORT);

  const emit = (level: LogLevel, msg: string, data?: unknown): void => {
    const entry: LogEntry = { ts: Date.now(), level, source, msg, data };
    port.write(JSON.stringify(entry));
  };

  return {
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
  };
}

// Hook variant that pulls ns from context, so call sites don't have to thread
// it through props. The returned logger is stable per (ns, source).
export function useLogger(source: string): Logger {
  const ns = useNs();
  return useMemo(() => createLogger(ns, source), [ns, source]);
}
