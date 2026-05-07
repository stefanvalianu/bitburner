import { useGameState } from "../util/gameState";
import { Check } from "../ui/Check";
import { Col } from "../ui/Col";
import { Row } from "../ui/Row";
import { useTheme } from "../ui/theme";

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
      <SectionHeading>General</SectionHeading>
      <BoolRow label="TOR router" ok={state.inventory.hasTorRouter} />
      <BoolRow label="Formulas.exe" ok={state.inventory.hasFormulas} />
      <SectionHeading>Port openers</SectionHeading>
      {state.inventory.portOpeners.map((p) => (
        <BoolRow key={p.name} label={p.name} ok={p.owned} />
      ))}
      <SectionHeading>Programs</SectionHeading>
      {state.inventory.programs.map((p) => (
        <BoolRow key={p.name} label={p.name} ok={p.owned} />
      ))}
    </Col>
  );
}
