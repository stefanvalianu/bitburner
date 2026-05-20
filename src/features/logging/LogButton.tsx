import { useState } from "react";
import { Button } from "@repo/features/components/Button";
import { LogsIcon } from "@repo/features/components/Icons";
import { Modal } from "@repo/features/components/Modal";
import { NotificationDot } from "@repo/features/components/NotificationDot";
import { useNotification } from "@repo/features/notifications/useNotification";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useLevelColor, useLogStream, LogStream } from "./LogStream";


export function LogButton() {
  const theme = useTheme();
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
        <LogsIcon color={theme.colors.secondary} />
        Logs ({entries.length})
      </Button>
      <Modal open={logsOpen} onClose={() => setLogsOpen(false)} title={`logs · ${entries.length}`}>
        <LogStream entries={entries} />
      </Modal>
    </>
  );
}
