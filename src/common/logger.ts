import { NS } from "@ns";
import { LOG_PORT } from "./ports";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  source: string;
  msg: string;
  data?: unknown;
}

export interface Logger {
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
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
  };
}
