import { createContext, MutableRefObject, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useNs } from "@repo/features/ns/NsProvider";
import { useLogger } from "@repo/features/logging/useLogger";
import { TaskManager } from "@repo/features/tasks/taskManager";
import { MAIN_UX_REFRESH_INTERVAL } from "@repo/common/constants";
import { GameInfo, readGameInfo } from "@repo/common/info/gameInfo";
import { usePropagator } from "./usePropagator";

export interface DashboardController {
  taskManager: TaskManager;
  gameInfo: GameInfo;
  gameInfoRef: MutableRefObject<GameInfo>;
}

type Props = {
  children: ReactNode;
}

const DashboardContext = createContext<DashboardController | null>(null);

export function DashboardProvider ({ children }: Props) {
  const ns = useNs();
  const taskManagerLogger = useLogger("task-manager");

  const [gameState, setGameState] = useState<GameInfo>({
    gang: undefined,
    player: undefined,
    servers: undefined,
    sleeves: undefined
  });
  const gameStateRef = useRef<GameInfo>(gameState);

  usePropagator(gameStateRef);

  console.log('[TODO-CLEANUP] dashboardProvider rendered');
  
  const taskManager = useMemo(
    () => new TaskManager(ns, taskManagerLogger),
    [ns, taskManagerLogger],
  );
  
  // convert port state for the shared info ports into the context's state, triggering downstream re-renders
  useEffect(() => {
    const id = setInterval(() => {
      const newState = readGameInfo(ns);
      
      if (newState.servers) {
        taskManager.runTick(newState);
      }

      setGameState(newState);
      gameStateRef.current = newState;
    }, MAIN_UX_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [ns, taskManager]);

  // no point in memoizing this since re-renders are only triggered by state updates, which would invalidate
  const controller = {
    gameInfo: gameState,
    gameInfoRef: gameStateRef,
    taskManager: taskManager
  } satisfies DashboardController;

  return (
    <DashboardContext.Provider value={controller}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardController {
  const v = useContext(DashboardContext);
  if (!v) throw new Error("useDashboard must be used inside <DashboardProvider>");
  return v;
}
