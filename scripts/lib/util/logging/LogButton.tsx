import { useState } from "react";
import { Button } from "../../ui/Button";
import { LogsIcon } from "../../ui/Icons";
import { Modal } from "../../ui/Modal";
import { NotificationDot } from "../../ui/NotificationDot";
import { useTheme } from "../../ui/theme";
import { useNotification } from "../../ui/useNotification";
import { useLevelColor, useLogStream, LogStream } from "./LogStream";

export function LogButton() {
  const { colors } = useTheme();
  const { notification, notify, clear } = useNotification();
  const levelColor = useLevelColor();
  const [logsOpen, setLogsOpen] = useState(false);

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
    <>
      <Button onClick={openLogs}>
        {notification && <NotificationDot color={notification.color} />}
        <LogsIcon color={colors.muted} />
        Logs ({entries.length})
      </Button>
      <Modal open={logsOpen} onClose={() => setLogsOpen(false)} title={`logs · ${entries.length}`}>
        <LogStream entries={entries} />
      </Modal>
    </>
  );
}
