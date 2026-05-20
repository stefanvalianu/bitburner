import { useCallback, useState } from "react";

export interface UseNotificationResult {
  notification: { color: string } | null;
  notify: (color: string) => void;
  clear: () => void;
}

// Latches a colored marker until the consumer calls clear(). Render with
// <NotificationDot color={...} /> wherever you want the indicator to appear.
export function useNotification(): UseNotificationResult {
  const [notification, setNotification] = useState<{ color: string } | null>(null);

  const clear = useCallback(() => setNotification(null), []);
  const notify = useCallback((color: string) => setNotification({ color }), []);

  return { notification, notify, clear };
}
