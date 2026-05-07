import { useState } from "react";
import type { NS } from "@ns";
import { GameStateProvider, useGameState } from "./lib/util/gameState";
import { TaskManagerProvider, useTaskManager } from "./lib/util/tasks/manager";
import { NsProvider, useNs } from "./lib/util/ns";
import { usePropagate } from "./lib/util/propagate";
import {
  Button,
  DashboardPanel,
  LogStream,
  LogsIcon,
  Modal,
  NotificationDot,
  PowerIcon,
  Row,
  ThemeProvider,
  useLevelColor,
  useLogStream,
  useNotification,
  useTheme,
} from "./lib/ui";
import { GameState, ServerMap, ServerPanel, ToolsPanel } from "./lib/features";

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
  const { colors, space } = useTheme();
  const levelColor = useLevelColor();
  const ns = useNs();
  const { killAll } = useTaskManager();
  const [logsOpen, setLogsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const { notification, notify, clear } = useNotification();
  usePropagate();

  // Poll logs continuously so the notification dot reflects activity even
  // while the modal is closed. Skip notifying on entries that arrive while
  // the user already has the modal open — they're seeing them in real time.
  const entries = useLogStream((top) => {
    if (!logsOpen) notify(levelColor[top.level]);
  });

  const openLogs = () => {
    clear();
    setLogsOpen(true);
  };

  // Kill every tracked controller + worker, then exit the dashboard itself.
  // ns.exit() terminates this script synchronously, so anything after it is
  // unreachable.
  const onKillAll = () => {
    killAll();
    ns.exit();
  };

  const headerActions = (
    <Row gap={space.sm}>
      <Button onClick={openLogs}>
        {notification && <NotificationDot color={notification.color} />}
        <LogsIcon color={colors.muted} />
        View logs ({entries.length})
      </Button>
      <Button onClick={onKillAll} variant="error">
        <PowerIcon color={colors.error} />
        Kill all
      </Button>
    </Row>
  );

  return (
    <>
      <DashboardPanel actions={headerActions}>
        <ToolsPanel onOpen={() => setStateOpen(true)} />
        <ServerPanel onOpenMap={() => setMapOpen(true)} />
      </DashboardPanel>
      <Modal open={logsOpen} onClose={() => setLogsOpen(false)} title={`logs · ${entries.length}`}>
        <LogStream entries={entries} />
      </Modal>
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
