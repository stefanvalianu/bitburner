import { useEffect, useState } from "react";
import type { NS } from "@ns";
import { Check } from "./Check";
import { Col } from "./Col";
import { Panel } from "./Panel";
import { Row } from "./Row";
import { useTheme } from "./theme";

const DEFAULT_INTERVAL_MS = 10_000;

export interface GameState {
  hasTorRouter: boolean;
  programs: { name: string; owned: boolean }[];
}

function snapshot(ns: NS): GameState {
  const programs = Object.values(ns.enums.ProgramName).map((name) => ({
    name,
    owned: ns.fileExists(name, "home"),
  }));
  return {
    hasTorRouter: ns.hasTorRouter(),
    programs,
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

interface BoolRowProps {
  label: string;
  ok: boolean;
}

function BoolRow({ label, ok }: BoolRowProps) {
  const { colors, space } = useTheme();
  return (
    <Row gap={space.sm}>
      <Check ok={ok} />
      <span style={{ color: ok ? colors.fg : colors.muted }}>{label}</span>
    </Row>
  );
}

function SectionHeading({ children }: { children: string }) {
  const { colors, space } = useTheme();
  return (
    <span
      style={{
        color: colors.fgDim,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1,
        paddingTop: space.xs,
      }}
    >
      {children}
    </span>
  );
}

export function GameStatePanel({ ns }: { ns: NS }) {
  const state = useGameState(ns);
  return (
    <Panel title="Game state">
      <Col gap={4}>
        <BoolRow label="TOR router" ok={state.hasTorRouter} />
        <SectionHeading>Programs</SectionHeading>
        {state.programs.map((p) => (
          <BoolRow key={p.name} label={p.name} ok={p.owned} />
        ))}
      </Col>
    </Panel>
  );
}
