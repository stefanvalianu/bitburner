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

export function PlayerPanelDialog() {
  const { state } = useDashboardController();
  const playerState = getPlayerMonitorState(state);

  return (
    <Col gap={4}>
      {playerState === undefined || playerState.inventory === undefined ? (
        <>Missing State</>
      ) : (
        <>
          <SectionHeading>General</SectionHeading>
          <BoolRow label="TOR router" ok={playerState.inventory.hasTorRouter} />
          <BoolRow label="Formulas.exe" ok={playerState.inventory.hasFormulas} />
          <SectionHeading>Port openers</SectionHeading>
          {playerState.inventory.portOpeners.map((p) => (
            <BoolRow key={p.name} label={p.name} ok={p.owned} />
          ))}
          <SectionHeading>Programs</SectionHeading>
          {playerState.inventory.programs.map((p) => (
            <BoolRow key={p.name} label={p.name} ok={p.owned} />
          ))}
        </>
      )}
    </Col>
  );
}
