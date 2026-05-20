import { Check } from "../../features/components/Check";
import { Col } from "../../features/components/Col";
import { Row } from "../../features/components/Row";
import { SectionHeading } from "../../features/components/SectionHeading";
import { useTheme } from "../../features/theme/ThemeProvider";
import { getPlayerMonitorState } from "../util/tasks/definitions/player-monitor/info";
import { useDashboardController } from "../util/useDashboardController";

interface BoolRowProps {
  label: string;
  ok: boolean;
}

function BoolRow({ label, ok }: BoolRowProps) {
  const theme = useTheme();
  return (
    <Row gap={theme.spacing.sm}>
      <Check ok={ok} />
      <span style={{ color: ok ? theme.colors.primary : theme.colors.secondary }}>{label}</span>
    </Row>
  );
}

export function ProgramsDialog() {
  const theme = useTheme();
  const { state } = useDashboardController();
  const playerState = getPlayerMonitorState(state);

  if (playerState === undefined || playerState.inventory === undefined) {
    return <>Missing State</>;
  }

  const inv = playerState.inventory;

  return (
    <Row gap={theme.spacing.lg} style={{ alignItems: "flex-start" }}>
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
