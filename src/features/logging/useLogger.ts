import { useMemo } from "react";
import { useNs } from "@repo/features/ns/NsProvider";
import { createLogger, Logger } from "@repo/common/logger";

export function useLogger(source: string): Logger {
  const ns = useNs();
  return useMemo(() => createLogger(ns, source), [ns, source]);
}
