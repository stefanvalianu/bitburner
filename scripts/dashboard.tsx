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
import { SkullIcon } from "./lib/ui/Icons";
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

// BFS from `home` so we hit every reachable host. `ns.killall`'s safetyguard
// keeps the dashboard alive on home; on remote hosts the calling script isn't
// running there, so the guard is a no-op and everything dies.
function killAllScripts(ns: NS): void {
  const visited = new Set<string>();
  const queue = ["home"];
  while (queue.length > 0) {
    const host = queue.shift()!;
    if (visited.has(host)) continue;
    visited.add(host);
    ns.killall(host);
    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  ns.exit();
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
  const theme = ns.ui.getTheme();
  ns.ui.resizeTail(width, height);
  ns.ui.moveTail(vpW - width - margin, margin);
  ns.ui.setTailMinimized(false);
  ns.ui.setTailTitle(
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        padding: 4,
      }}
    >
      <span
        style={{
          flex: 1,
          color: theme.primary,
          fontSize: 16,
          fontWeight: "bolder",
        }}
      >
        <span style={{ color: theme.hack }}>⦾</span> Dashboard
      </span>
      <button
        onClick={() => killAllScripts(ns)}
        title="Kill all scripts"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 4,
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <SkullIcon color={theme.error} />
      </button>
    </div>,
  );

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
