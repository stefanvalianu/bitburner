import { useGameState } from "../gameState";
import { Check } from "./Check";
import { Col } from "./Col";
import { Row } from "./Row";
import { useTheme } from "./theme";

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

export function GameState() {
  const state = useGameState();
  return (
    <Col gap={4}>
      <BoolRow label="TOR router" ok={state.hasTorRouter} />
      <SectionHeading>Programs</SectionHeading>
      {state.programs.map((p) => (
        <BoolRow key={p.name} label={p.name} ok={p.owned} />
      ))}
    </Col>
  );
}

export function GameStateIcon({ color }: { color: string }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ verticalAlign: "middle", flexShrink: 0 }}
      role="img"
    >
      <title>Game state</title>
      <path d="M8 1.5 L13.5 3.5 V8 C13.5 11 11 13.5 8 14.5 C5 13.5 2.5 11 2.5 8 V3.5 Z" />
      <path d="M5.5 8 L7.25 9.75 L10.5 6.5" />
    </svg>
  );
}
