import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_DURATION_MS = 10_000;

export interface UseNotificationResult {
  notification: { color: string } | null;
  notify: (color: string, durationMs?: number) => void;
  clear: () => void;
}

// Shows a transient colored marker for a fixed duration. Each new notify()
// resets the timer, so a burst of events keeps the marker visible until
// activity quiets down. Render with <NotificationDot color={...} /> wherever
// you want the indicator to appear (commonly in a tail title).
export function useNotification(): UseNotificationResult {
  const [notification, setNotification] = useState<{ color: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setNotification(null);
  }, []);

  const notify = useCallback((color: string, durationMs: number = DEFAULT_DURATION_MS) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setNotification({ color });
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setNotification(null);
    }, durationMs);
  }, []);

  // Cancel any pending timer when the host component unmounts so a setTimeout
  // doesn't fire setState on a dead tree.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { notification, notify, clear };
}
