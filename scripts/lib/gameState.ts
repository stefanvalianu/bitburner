import { useEffect, useState } from "react";
import type { NS } from "@ns";
import { scanAll, type ServerInfo } from "./utils/serverMap";

const DEFAULT_INTERVAL_MS = 10_000;

export interface GameState {
  hasTorRouter: boolean;
  programs: { name: string; owned: boolean }[];
  servers: ServerInfo[];
}

function snapshot(ns: NS): GameState {
  const programs = Object.values(ns.enums.ProgramName).map((name) => ({
    name,
    owned: ns.fileExists(name, "home"),
  }));
  return {
    hasTorRouter: ns.hasTorRouter(),
    programs,
    servers: scanAll(ns),
  };
}

// Polls coarse-grained game state on a slow interval. Use for things that
// change rarely (purchases, faction joins, milestones) — fast-changing values
// like money/exp belong in a tighter loop on the consumer.
export function useGameState(ns: NS, intervalMs: number = DEFAULT_INTERVAL_MS): GameState {
  const [state, setState] = useState<GameState>(() => snapshot(ns));
  useEffect(() => {
    const id = setInterval(() => setState(snapshot(ns)), intervalMs);
    return () => clearInterval(id);
  }, [ns, intervalMs]);
  return state;
}
