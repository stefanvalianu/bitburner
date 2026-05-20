import { PlayerPanel } from "@repo/features/player/PlayerPanel";
import { ServerPanel } from "@repo/features/servers/ServerPanel";
import { TaskPanel } from "@repo/lib/features/TaskPanel";
import { DashboardPanel } from "@repo/features/components/DashboardPanel";
import { PortViewerButton } from "@repo/features/components/PortViewerButton";
import { PreferencesButton } from "@repo/features/components/PreferencesButton";
import { PropagationStamp } from "@repo/features/components/PropagationStamp";
import { Row } from "@repo/features/components/Row";
import { LogButton } from "@repo/features/logging/LogButton";
import { usePropagate } from "@repo/features/usePropagate";
import { useTheme } from "@repo/features/theme/ThemeProvider";

export function Dashboard() {
  const theme = useTheme();
  usePropagate();

  return (
    <>
      <DashboardPanel
        actions={
          <Row gap={theme.spacing.sm}>
            <PreferencesButton />
            <PortViewerButton />
            <LogButton />
          </Row>
        }
      >
        <PlayerPanel />
        <TaskPanel />
        <ServerPanel />
      </DashboardPanel>
      <PropagationStamp />
    </>
  );
}
