import { useState } from "react";
import type { NS } from "@ns";
import { GameStateProvider, useGameState } from "./lib/gameState";
import { NsProvider } from "./lib/ns";
import {
  Button,
  Col,
  GameState,
  GameStateIcon,
  LogStream,
  LogsIcon,
  Modal,
  NotificationDot,
  Panel,
  Row,
  ServerMap,
  ThemeProvider,
  WorldIcon,
  useLevelColor,
  useLogStream,
  useNotification,
  useTheme,
} from "./lib/ui";

function Dashboard() {
  const { colors } = useTheme();
  const levelColor = useLevelColor();
  const { servers } = useGameState();
  const [logsOpen, setLogsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const { notification, notify, clear } = useNotification();
  const backdoored = servers.filter((s) => s.backdoorInstalled || s.purchasedByPlayer).length;

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

  return (
    <Col gap={8}>
      <Panel title="Home Dashboard">
        <Row>
          <Button onClick={openLogs}>
            {notification && <NotificationDot color={notification.color} />}
            <LogsIcon color={colors.muted} />
            View logs ({entries.length})
          </Button>
          <Button onClick={() => setMapOpen(true)}>
            <WorldIcon color={colors.accent} />
            Server map ({backdoored}/{servers.length})
          </Button>
          <Button onClick={() => setStateOpen(true)}>
            <GameStateIcon color={colors.success} />
            Game state
          </Button>
        </Row>
      </Panel>
      <Modal open={logsOpen} onClose={() => setLogsOpen(false)} title={`logs · ${entries.length}`}>
        <LogStream entries={entries} />
      </Modal>
      <Modal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title={`Server map · ${backdoored}/${servers.length}`}
      >
        <ServerMap />
      </Modal>
      <Modal open={stateOpen} onClose={() => setStateOpen(false)} title="Game state">
        <GameState />
      </Modal>
    </Col>
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
          <Dashboard />
        </GameStateProvider>
      </ThemeProvider>
    </NsProvider>,
  );
  while (true) await ns.asleep(60_000);
}
