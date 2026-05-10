import { Check } from "../ui/Check";
import { Col } from "../ui/Col";
import { Row } from "../ui/Row";
import { useTheme } from "../ui/theme";
import { getPlayerMonitorState } from "../util/tasks/definitions/player-monitor/info";
import { useDashboardController } from "../util/useDashboardController";

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

export function ProgramsDialog() {
  const { space } = useTheme();
  const { state } = useDashboardController();
  const playerState = getPlayerMonitorState(state);

  if (playerState === undefined || playerState.inventory === undefined) {
    return <>Missing State</>;
  }

  const inv = playerState.inventory;

  return (
    <Row gap={space.lg} style={{ alignItems: "flex-start" }}>
      <Col gap={4}>
        <SectionHeading>General</SectionHeading>
        <BoolRow label="TOR router" ok={inv.hasRouter} />
        <BoolRow label="Formulas.exe" ok={inv.hasFormulas} />
        <SectionHeading>Port openers</SectionHeading>
        {inv.portOpeners.map((p) => (
          <BoolRow key={p.name} label={p.name} ok={p.owned} />
        ))}
      </Col>
      <Col gap={4}>
        <SectionHeading>Programs</SectionHeading>
        {inv.programs.map((p) => (
          <BoolRow key={p.name} label={p.name} ok={p.owned} />
        ))}
      </Col>
    </Row>
  );
}
