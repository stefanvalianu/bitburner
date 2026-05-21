import { Col } from "@repo/features/components/Col";
import { Panel } from "@repo/features/components/Panel";
import { Row } from "@repo/features/components/Row";
import { SectionHeading } from "@repo/features/components/SectionHeading";
import { StatRow } from "@repo/features/components/StatRow";
import { usePreferences } from "@repo/features/preferences/PreferencesProvider";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";
import { StatCard } from "./StatCard";

export function PlayerPanel() {
  const theme = useTheme();
  const ns = useNs();
  const { preferences } = usePreferences();

  const player = ns.getPlayer();

  const actions = (
    <Row gap={theme.spacing.sm} style={{ alignItems: "center" }}>
      {preferences?.reservedMoney > 0 && (
        <span style={{ color: theme.colors.secondary, fontSize: "0.85em" }}>
          {`Reserved: $${ns.format.number(preferences.reservedMoney, 2)}`}
        </span>
      )}
    </Row>
  );

  return (
    <Panel title="Player" actions={actions}>
      <Row gap={theme.spacing.lg} style={{ alignItems: "flex-start" }}>
        <StatCard player={player} />
        <Col gap={theme.spacing.md} style={{ flex: 1, minWidth: 0 }}>
          <span style={{ color: theme.colors.primary }}>📍 {player.city}</span>
          <Col gap={theme.spacing.xs}>
            <SectionHeading>Crime</SectionHeading>
            <StatRow label="killed" value={ns.format.number(player.numPeopleKilled, 0)} />
            <StatRow label="karma" value={ns.format.number(player.karma, 2)} />
          </Col>
        </Col>
      </Row>
    </Panel>
  );
}
