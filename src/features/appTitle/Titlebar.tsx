import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";
import { useEffect, useState } from "react";
import { MAIN_UX_REFRESH_INTERVAL } from "@repo/common/constants";
import { GameInfo, readGameInfo } from "@repo/common/info/gameInfo";

export function Titlebar() {
  const ns = useNs();
  const theme = useTheme();

  const [gameState, setGameState] = useState<GameInfo | null>(null);

  // Simple, self-refreshing titlebar component.
  useEffect(() => {
    const id = setInterval(() => {
      const newState = readGameInfo(ns);
      setGameState(newState);
    }, MAIN_UX_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [ns]);
  
  return (
    <div style={{ padding: "4px 8px" }}>
      {gameState === null || gameState.player === undefined && (
        <span style={{ color: theme.colors.primary, fontSize: 16, fontWeight: "bolder" }}>
          Dashboard loading...
        </span>
      )}
      {gameState?.player && (
        <>
          <span style={{ color: theme.colors.hp }}>
            HP {gameState.player.hpCur}/{gameState.player.hpMax}
          </span>
          <span style={{ color: theme.colors.money, marginLeft: "8px" }}>
            ${ns.format.number(gameState.player.money, 2)}
          </span>
        </>
      )}
    </div>
  );
}
