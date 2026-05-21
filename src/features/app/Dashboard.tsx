import { DashboardPanel } from "@repo/features/components/DashboardPanel";
import { PreferencesButton } from "@repo/features/components/PreferencesButton";
import { Row } from "@repo/features/components/Row";
import { LogButton } from "@repo/features/logging/LogButton";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { PlayerPanel } from "@repo/features/player/PlayerPanel";
import { ServerPanel } from "@repo/features/servers/ServerPanel";

export function Dashboard() {
  const theme = useTheme();

  return (
    <>
      <DashboardPanel
        actions={
          <Row gap={theme.spacing.sm}>
            <PreferencesButton />
            <LogButton />
          </Row>
        }
      >
        <PlayerPanel />
        <ServerPanel />
      </DashboardPanel>
    </>
  );
}
