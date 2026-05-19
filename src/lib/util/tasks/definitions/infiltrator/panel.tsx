import type { NS, InfiltrationLocation } from "@ns";
import { Button } from "../../../../ui/Button";
import { Col } from "../../../../ui/Col";
import { Row } from "../../../../ui/Row";
import { SortableColumn, SortableTable } from "../../../../ui/SortableTable";
import { useTheme } from "../../../../ui/theme";
import { useNs } from "../../../ns";
import { useDashboardController } from "../../../useDashboardController";
import {
  INFILTRATION_SOLVER_TASK_ID,
  type InfiltrationSolverTaskState,
} from "../infiltration-solver/info";
import { INFILTRATOR_TASK_ID, type InfiltratorTaskState } from "./info";
import { TaskCustomPanel } from "../tasks";

const GAME_LABELS: Record<string, string> = {
  slash: "Slash",
  bracket: "Brackets",
  backward: "Backward",
  bribe: "Bribe",
  cheatCode: "Cheat code",
  cyberpunk2077: "Match symbols",
  minesweeper: "Minesweeper",
  wireCutting: "Wire cutting",
};

type Theme = ReturnType<typeof useTheme>;

const buildColumns = (ns: NS, colors: Theme["colors"]): SortableColumn<InfiltrationLocation>[] => [
  {
    key: "location",
    label: "location",
    align: "left",
    flex: 2,
    accessor: (r) => r.location.name,
    render: (r) => <span style={{ color: colors.fg }}>{r.location.name}</span>,
  },
  {
    key: "city",
    label: "city",
    align: "left",
    flex: 1,
    accessor: (r) => r.location.city,
    render: (r) => <span style={{ color: colors.fg }}>{r.location.city}</span>,
  },
  {
    key: "difficulty",
    label: "difficulty",
    align: "right",
    flex: 1,
    accessor: (r) => r.difficulty,
    render: (r) => <span style={{ color: colors.fg }}>{ns.format.number(r.difficulty, 2)}</span>,
  },
  {
    key: "maxClearance",
    label: "max clearance",
    align: "right",
    flex: 1,
    accessor: (r) => r.maxClearanceLevel,
    render: (r) => (
      <span style={{ color: colors.fg }}>{ns.format.number(r.maxClearanceLevel, 0)}</span>
    ),
  },
  {
    key: "startingSecurity",
    label: "start sec",
    align: "right",
    flex: 1,
    accessor: (r) => r.startingSecurityLevel,
    render: (r) => (
      <span style={{ color: colors.fg }}>{ns.format.number(r.startingSecurityLevel, 2)}</span>
    ),
  },
  {
    key: "sellCash",
    label: "sell cash",
    align: "right",
    flex: 1,
    accessor: (r) => r.reward.sellCash,
    render: (r) => (
      <span style={{ color: colors.money }}>${ns.format.number(r.reward.sellCash, 0)}</span>
    ),
  },
  {
    key: "tradeRep",
    label: "trade rep",
    align: "right",
    flex: 1,
    accessor: (r) => r.reward.tradeRep,
    render: (r) => <span style={{ color: colors.fg }}>{ns.format.number(r.reward.tradeRep)}</span>,
  },
  {
    key: "soaRep",
    label: "SoA rep",
    align: "right",
    flex: 1,
    accessor: (r) => r.reward.SoARep,
    render: (r) => <span style={{ color: colors.fg }}>{ns.format.number(r.reward.SoARep)}</span>,
  },
];

export const InfiltratorPanel: TaskCustomPanel = () => {
  const { colors, space } = useTheme();
  const ns = useNs();
  const { state, startTasks, shutdownTask } = useDashboardController();

  const taskState = state.tasks[INFILTRATOR_TASK_ID] as unknown as InfiltratorTaskState | undefined;
  const infiltrations = taskState?.infiltrations ?? [];

  const solverSlot = state.tasks[INFILTRATION_SOLVER_TASK_ID] as
    | (InfiltrationSolverTaskState & { status?: string })
    | undefined;
  const solverPresent = solverSlot !== undefined;
  const solverRunning = solverPresent && solverSlot?.status === "running";
  const solverStopping = solverPresent && solverSlot?.status === "stopping";
  const currentGameLabel = solverSlot?.currentGame
    ? (GAME_LABELS[solverSlot.currentGame] ?? solverSlot.currentGame)
    : null;
  const keysSent = solverSlot?.keysSent ?? 0;

  const solverStatus = solverStopping
    ? "stopping…"
    : solverRunning
      ? currentGameLabel
        ? `playing ${currentGameLabel} (${keysSent} keys sent)`
        : `idle — waiting for infiltration (${keysSent} keys sent)`
      : solverPresent
        ? `requested — ${solverSlot?.status ?? "?"}`
        : "off";

  const startSolver = () => startTasks([INFILTRATION_SOLVER_TASK_ID]);
  const stopSolver = () => shutdownTask(INFILTRATION_SOLVER_TASK_ID);

  return (
    <Col gap={space.sm}>
      <Row gap={space.md}>
        {solverPresent ? (
          <Button onClick={stopSolver} variant="warn" disabled={!solverRunning}>
            ■ Stop solver
          </Button>
        ) : (
          <Button onClick={startSolver} variant="primary">
            ▶ Start solver
          </Button>
        )}
        <span
          style={{ color: solverRunning ? colors.fg : colors.muted, fontSize: "0.9em" }}
          title="Start the solver BEFORE clicking Infiltrate Company — it can't hook into infiltrations already in progress."
        >
          solver: {solverStatus}
        </span>
        {solverSlot?.lastError && (
          <span style={{ color: colors.warn, fontSize: "0.85em" }}>
            last error: {solverSlot.lastError}
          </span>
        )}
      </Row>
      {infiltrations.length === 0 ? (
        <span style={{ color: colors.muted }}>
          No infiltrations scanned yet — first refresh pending.
        </span>
      ) : (
        <SortableTable<InfiltrationLocation>
          columns={buildColumns(ns, colors)}
          rows={infiltrations}
          rowKey={(r) => r.location.name}
          collapsible
          collapsedRows={3}
          defaultSort={{ column: "difficulty", direction: "asc" }}
        />
      )}
    </Col>
  );
};
