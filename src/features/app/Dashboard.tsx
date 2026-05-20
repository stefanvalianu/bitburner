import { PlayerPanel } from "../../lib/features/PlayerPanel";
import { ServerPanel } from "../../lib/features/ServerPanel";
import { TaskPanel } from "../../lib/features/TaskPanel";
import { DashboardPanel } from "../components/DashboardPanel";
import { PortViewerButton } from "../components/PortViewerButton";
import { PreferencesButton } from "../components/PreferencesButton";
import { PropagationStamp } from "../components/PropagationStamp";
import { Row } from "../components/Row";
import { LogButton } from "../../lib/util/logging/LogButton";
import { usePropagate } from "../../lib/util/usePropagate";
import { useTheme } from "../theme/ThemeProvider";

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
