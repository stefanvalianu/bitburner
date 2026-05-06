import { useEffect, useMemo, useState } from "react";
import type { NS } from "@ns";
import { createLogger } from "./lib/log";
import {
  Button,
  Col,
  LogStream,
  Modal,
  NotificationDot,
  Panel,
  Row,
  Stat,
  ThemeProvider,
  useLevelColor,
  useLogStream,
  useNotification,
  useTheme,
} from "./lib/ui";

function Dashboard({ ns }: { ns: NS }) {
  const { colors } = useTheme();
  const levelColor = useLevelColor();
  const log = useMemo(() => createLogger(ns, "dashboard"), [ns]);
  const [money, setMoney] = useState(ns.getServerMoneyAvailable("home"));
  const [hackLevel, setHackLevel] = useState(ns.getHackingLevel());
  const [tick, setTick] = useState(0);
  const [logsOpen, setLogsOpen] = useState(false);
  const { notification, notify, clear } = useNotification();

  // Poll logs continuously so the notification dot reflects activity even
  // while the modal is closed. Skip notifying on entries that arrive while
  // the user already has the modal open — they're seeing them in real time.
  const entries = useLogStream(ns, (top) => {
    if (!logsOpen) notify(levelColor[top.level]);
  });

  useEffect(() => {
    log.info("dashboard mounted");
    const id = setInterval(() => {
      setMoney(ns.getServerMoneyAvailable("home"));
      setHackLevel(ns.getHackingLevel());
      setTick((t) => t + 1);
    }, 500);
    return () => {
      clearInterval(id);
      log.info("dashboard unmounted");
    };
  }, [ns, log]);

  const moneyStr = money.toLocaleString(undefined, { maximumFractionDigits: 0 });

  const openLogs = () => {
    clear();
    setLogsOpen(true);
  };

  return (
    <>
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
      <Modal open={logsOpen} onClose={() => setLogsOpen(false)} title={`logs · ${entries.length}`}>
        <LogStream entries={entries} />
      </Modal>
    </>
  );
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.clearLog();
  ns.ui.openTail();
  ns.printRaw(
    <ThemeProvider ns={ns}>
      <Dashboard ns={ns} />
    </ThemeProvider>,
  );
  while (true) await ns.asleep(60_000);
}
