import { useState, useEffect } from "react";
import { getPortData, PLAYER_STATE_PORT } from "@repo/common/ports";
import { useNs } from "./ns/NsProvider";
import { PlayerMonitorTaskState, PLAYER_MONITOR_FAST_REFRESH_FREQUENCY_MS } from "@repo/tasks/player-monitor/info";

// Get more up-to-date data from the player port so we can display more responsive UX
export function useLivePlayerState(fallback: PlayerMonitorTaskState): PlayerMonitorTaskState {
  const ns = useNs();
  const [snap, setSnap] = useState<PlayerMonitorTaskState>(fallback);
  useEffect(() => {
    const id = setInterval(() => {
      const data = getPortData<PlayerMonitorTaskState>(ns, PLAYER_STATE_PORT);
      if (data) setSnap(data);
    }, PLAYER_MONITOR_FAST_REFRESH_FREQUENCY_MS);
    return () => clearInterval(id);
  }, [ns]);
  return snap;
}
