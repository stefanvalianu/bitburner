import type { NS } from "@ns";
import { DashboardControllerProvider } from "./lib/util/useDashboardController";
import { NsProvider } from "./lib/util/ns";
import { usePropagate } from "./lib/util/usePropagate";
import { clearPorts } from "./lib/util/ports";
import { LogButton } from "./lib/util/logging/LogButton";
import { PortViewerButton } from "./lib/ui/PortViewerButton";
import { PropagationStamp } from "./lib/ui/PropagationStamp";
import { PlayerPanel } from "./lib/features/PlayerPanel";
import { ServerPanel } from "./lib/features/ServerPanel";
import { TaskPanel } from "./lib/features/TaskPanel";
import { DashboardPanel } from "./lib/ui/DashboardPanel";
import { Row } from "./lib/ui/Row";
import { useTheme, ThemeProvider } from "./lib/ui/theme";

function Dashboard() {
  const { space } = useTheme();
  usePropagate();

  return (
    <>
      <DashboardPanel
        actions={
          <Row gap={space.sm}>
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

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.clearLog();
  ns.ui.openTail();
  // Pin the dashboard to the top-right: full viewport height, half width,
  // with a small margin around the edges. Bitburner's tail windows persist
  // across restarts, so re-apply size and position on every launch.
  const margin = 8; // matches theme.space.md
  const [vpW, vpH] = ns.ui.windowSize();
  const width = Math.floor(vpW / 2) - margin * 2;
  const height = vpH - margin * 2;
  ns.ui.resizeTail(width, height);
  ns.ui.moveTail(vpW - width - margin, margin);

  clearPorts(ns);

  ns.printRaw(
    <NsProvider ns={ns}>
      <ThemeProvider>
        <DashboardControllerProvider>
          <Dashboard />
        </DashboardControllerProvider>
      </ThemeProvider>
    </NsProvider>,
  );
  while (true) await ns.asleep(60_000);
}
