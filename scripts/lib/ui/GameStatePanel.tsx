import { useGameState } from "../gameState";
import { Check } from "./Check";
import { Col } from "./Col";
import { Panel } from "./Panel";
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

export function GameStatePanel() {
  const state = useGameState();
  return (
    <Panel title="Game state" collapsible defaultOpen>
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
