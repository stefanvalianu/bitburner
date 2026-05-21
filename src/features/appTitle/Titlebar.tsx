import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";
import { useEffect, useState } from "react";
import { MAIN_UX_REFRESH_INTERVAL } from "@repo/common/constants";

export function Titlebar() {
  const ns = useNs();
  const theme = useTheme();

  const [tick, setTick] = useState<number>(0);

  // Simple, self-refreshing titlebar component.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((tick) => tick + 1);
    }, MAIN_UX_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [ns]);

  // we allow usage of getPlayer() in dashboard
  const player = ns.getPlayer();
  
  return (
    <div style={{ padding: "4px 8px" }}>
      <span style={{ color: theme.colors.hp }}>
        HP {player.hp.current}/{player.hp.max}
      </span>
      <span style={{ color: theme.colors.money, marginLeft: "8px" }}>
        ${ns.format.number(player.money, 2)}
      </span>
    </div>
  );
}
