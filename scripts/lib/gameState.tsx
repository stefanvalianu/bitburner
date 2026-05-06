import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { NS } from "@ns";
import { useNs } from "./ns";
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

const GameStateContext = createContext<GameState | null>(null);

// Polls coarse-grained game state on a slow interval and exposes it through
// context. Use for things that change rarely (purchases, faction joins,
// milestones) — fast-changing values like money/exp belong in a tighter loop
// on the consumer.
export function GameStateProvider({
  intervalMs = DEFAULT_INTERVAL_MS,
  children,
}: {
  intervalMs?: number;
  children: ReactNode;
}) {
  const ns = useNs();
  const [state, setState] = useState<GameState>(() => snapshot(ns));
  useEffect(() => {
    const id = setInterval(() => setState(snapshot(ns)), intervalMs);
    return () => clearInterval(id);
  }, [ns, intervalMs]);
  return (
    <GameStateContext.Provider value={state}>{children}</GameStateContext.Provider>
  );
}

export function useGameState(): GameState {
  const v = useContext(GameStateContext);
  if (!v) throw new Error("useGameState must be used inside <GameStateProvider>");
  return v;
}
