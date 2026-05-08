import { useState } from "react";
import type { NS } from "@ns";
import { GameStateProvider, useGameState } from "./lib/util/gameState";
import { TaskManagerProvider } from "./lib/util/tasks/manager";
import { NsProvider } from "./lib/util/ns";
import { usePropagate } from "./lib/util/propagate";
import {
  DashboardPanel,
  Modal,
  Row,
  ThemeProvider,
  useTheme,
} from "./lib/ui";
import { GameState, ServerMap, ServerPanel, ToolsPanel } from "./lib/features";
import { LOG_PORT, TASK_EVENTS_PORT, TASK_STATE_PORT } from "./lib/util/ports";
import { LogButton } from "./lib/util/logging/LogButton";

function PropagationStamp() {
  const { colors } = useTheme();
  const { propagatedVersion } = useGameState();
  if (!propagatedVersion) return null;
  return (
    <span
      style={{
        position: "fixed",
        bottom: 4,
        right: 6,
        fontSize: 10,
        color: colors.muted,
        pointerEvents: "none",
      }}
    >
      {propagatedVersion}
    </span>
  );
}

function Dashboard() {
  const { space } = useTheme();
  const [mapOpen, setMapOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  usePropagate();

  const headerActions = (
    <Row gap={space.sm}>
      <LogButton />
    </Row>
  );

  return (
    <>
      <DashboardPanel actions={headerActions}>
        <ToolsPanel onOpen={() => setStateOpen(true)} />
        <ServerPanel onOpenMap={() => setMapOpen(true)} />
      </DashboardPanel>
      <Modal open={mapOpen} onClose={() => setMapOpen(false)} title="Server map">
        <ServerMap />
      </Modal>
      <Modal open={stateOpen} onClose={() => setStateOpen(false)} title="Tools">
        <GameState />
      </Modal>
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
  // clear all ports in case there is crap on the wire persisting through re-starts
  ns.clearPort(LOG_PORT);
  ns.clearPort(TASK_STATE_PORT);
  ns.clearPort(TASK_EVENTS_PORT);

  ns.printRaw(
    <NsProvider ns={ns}>
      <ThemeProvider>
        <GameStateProvider>
          <TaskManagerProvider>
            <Dashboard />
          </TaskManagerProvider>
        </GameStateProvider>
      </ThemeProvider>
    </NsProvider>,
  );
  while (true) await ns.asleep(60_000);
}
