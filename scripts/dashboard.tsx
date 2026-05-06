import { useEffect, useState } from "react";
import type { NS } from "@ns";
import { useLogger } from "./lib/log";
import { GameStateProvider } from "./lib/gameState";
import { NsProvider, useNs } from "./lib/ns";
import {
  Button,
  Col,
  GameStatePanel,
  LogStream,
  Modal,
  NotificationDot,
  Panel,
  Row,
  ServerMapPanel,
  Stat,
  ThemeProvider,
  useLevelColor,
  useLogStream,
  useNotification,
  useTheme,
} from "./lib/ui";

function Dashboard() {
  const ns = useNs();
  const { colors } = useTheme();
  const levelColor = useLevelColor();
  const log = useLogger("dashboard");
  const [money, setMoney] = useState(ns.getServerMoneyAvailable("home"));
  const [hackLevel, setHackLevel] = useState(ns.getHackingLevel());
  const [tick, setTick] = useState(0);
  const [logsOpen, setLogsOpen] = useState(false);
  const { notification, notify, clear } = useNotification();

  // Poll logs continuously so the notification dot reflects activity even
  // while the modal is closed. Skip notifying on entries that arrive while
  // the user already has the modal open — they're seeing them in real time.
  const entries = useLogStream((top) => {
    if (!logsOpen) notify(levelColor[top.level]);
  });

  useEffect(() => {
    const id = setInterval(() => {
      setMoney(ns.getServerMoneyAvailable("home"));
      setHackLevel(ns.getHackingLevel());
      setTick((t) => t + 1);
    }, 500);
    return () => {
      clearInterval(id);
    };
  }, [ns]);

  const moneyStr = money.toLocaleString(undefined, { maximumFractionDigits: 0 });

  const openLogs = () => {
    clear();
    setLogsOpen(true);
  };

  return (
    <Col gap={8}>
      <Panel title="Home Dashboard">
        <Col gap={4}>
          <Stat label="Money" value={`$${moneyStr}`} color={colors.money} />
          <Stat label="Hacking level" value={hackLevel} color={colors.hack} />
          <Stat label="Tick" value={tick} color={colors.muted} />
        </Col>
        <Row>
          <Button onClick={() => log.info("snapshot", { money, hackLevel })}>
            Log snapshot
          </Button>
          <Button variant="warn" onClick={() => log.warn("manual warn from dashboard")}>
            Emit warn
          </Button>
          <Button onClick={openLogs}>
            {notification && <NotificationDot color={notification.color} />}
            View logs ({entries.length})
          </Button>
        </Row>
      </Panel>
      <GameStatePanel />
      <ServerMapPanel />
      <Modal open={logsOpen} onClose={() => setLogsOpen(false)} title={`logs · ${entries.length}`}>
        <LogStream entries={entries} />
      </Modal>
    </Col>
  );
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.clearLog();
  ns.ui.openTail();
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
