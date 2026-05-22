import { createContext, MutableRefObject, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useNs } from "@repo/features/ns/NsProvider";
import { useLogger } from "@repo/features/logging/useLogger";
import { TaskManager } from "@repo/features/tasks/taskManager";
import { MAIN_UX_REFRESH_INTERVAL } from "@repo/common/constants";
import { usePropagator } from "./usePropagator";
import { Player, Server } from "@ns";
import { crawlServers } from "@repo/common/crawlServers";
import { ServerHacker } from "../servers/serverHacker";

export interface DashboardState {
  player: Player;
  servers: Server[];
}

export interface DashboardController {
  taskManager: TaskManager;
  state: DashboardState;
  stateRef: MutableRefObject<DashboardState>;
}

type Props = {
  children: ReactNode;
}

const DashboardContext = createContext<DashboardController | null>(null);

export function DashboardProvider ({ children }: Props) {
  const ns = useNs();
  const taskManagerLogger = useLogger("task-manager");

  const [gameState, setGameState] = useState<DashboardState>({
    player: ns.getPlayer(),
    servers: crawlServers(ns)
  });
  const gameStateRef = useRef<DashboardState>(gameState);

  usePropagator(gameStateRef);

  console.log('[TODO-CLEANUP] dashboardProvider rendered');
  
  const taskManager = useMemo(
    () => new TaskManager(ns, gameStateRef, taskManagerLogger),
    [ns, taskManagerLogger],
  );

  const serverHackerRef = useRef<ServerHacker | undefined>(new ServerHacker(ns, gameStateRef));
  
  // convert port state for the shared info ports into the context's state, triggering downstream re-renders
  useEffect(() => {
    const id = setInterval(() => {
      const newState = {
        player: ns.getPlayer(),
        servers: crawlServers(ns)
      } satisfies DashboardState;
      
      gameStateRef.current = newState;
      
      taskManager.runTick();

      if (serverHackerRef.current) {
        if (!serverHackerRef.current.runTick()) {
          taskManagerLogger.info(`All servers nuked.`);
          serverHackerRef.current = undefined;
        }
      }

      setGameState(newState);
    }, MAIN_UX_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [ns, taskManager, taskManagerLogger]);

  // no point in memoizing this since re-renders are only triggered by state updates, which would invalidate
  const controller = {
    state: gameState,
    stateRef: gameStateRef,
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
