import type { ReactNode } from "react";
import { useMemo } from "react";
import type { NS } from "@ns";
import { Button } from "../../../../ui/Button";
import { Col } from "../../../../ui/Col";
import { TargetIcon, UntargetIcon } from "../../../../ui/Icons";
import { Row } from "../../../../ui/Row";
import { SortableColumn, SortableTable } from "../../../../ui/SortableTable";
import { useTheme } from "../../../../ui/theme";
import { useNs } from "../../../ns";
import { useDashboardController } from "../../../useDashboardController";
import { HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";
import { formatDuration } from "../../../formatting";
import { TaskCustomPanel } from "../tasks";
import {
  ULTRAHACKER_TASK_ID,
  UserCommunicationRequest,
  type ServerAnalysis,
  type UltrahackerTaskState,
} from "./info";

type Theme = ReturnType<typeof useTheme>;

const buildColumns = (
  ns: NS,
  colors: Theme["colors"],
  target: string,
): SortableColumn<ServerAnalysis>[] => [
  {
    key: "hostname",
    label: "hostname",
    flex: 2,
    align: "left",
    accessor: (r) => r.hostname,
    render: (r) => (
      <span style={{ color: r.hostname === target ? colors.accent : colors.fg }}>{r.hostname}</span>
    ),
  },
  {
    key: "hackChance",
    label: "hack chance",
    flex: 1,
    align: "right",
    accessor: (r) => r.hackChance,
    render: (r) => <span style={{ color: colors.fg }}>{ns.format.percent(r.hackChance, 1)}</span>,
  },
  {
    key: "maxMoney",
    label: "max money",
    flex: 1,
    align: "right",
    accessor: (r) => r.maxMoney,
    render: (r) => <span style={{ color: colors.money }}>${ns.format.number(r.maxMoney, 0)}</span>,
  },
  {
    key: "batchTime",
    label: "batch time",
    flex: 1,
    align: "right",
    accessor: (r) => r.batchTime,
    render: (r) => <span style={{ color: colors.fg }}>{formatDuration(r.batchTime)}</span>,
  },
  {
    key: "profitPerSecond",
    label: "$/s",
    flex: 1,
    align: "right",
    accessor: (r) => r.profitPerSecond,
    render: (r) => (
      <span style={{ color: colors.money }}>${ns.format.number(r.profitPerSecond, 2)}</span>
    ),
  },
  {
    key: "xpPerSecond",
    label: "xp/s",
    flex: 1,
    align: "right",
    accessor: (r) => r.xpPerSecond,
    render: (r) => <span style={{ color: colors.hack }}>{ns.format.number(r.xpPerSecond, 2)}</span>,
  },
];

export const UltrahackerPanel: TaskCustomPanel = () => {
  const { colors, space } = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();

  const taskState = state.tasks[ULTRAHACKER_TASK_ID] as unknown as UltrahackerTaskState | undefined;
  const target = taskState?.target ?? "";
  const userTarget = taskState?.userTarget;
  // Shipped from the task — see comment on UltrahackerTaskState.targetOptions
  // for why this list lives in state instead of being recomputed here.
  const targetOptions = taskState?.targetOptions ?? [];
  const pipelineStartedAt = taskState?.pipelineStartedAt ?? 0;
  const firstLandingTime = taskState?.firstLandingTime ?? 0;
  const latestLandingTime = taskState?.latestLandingTime ?? 0;
  const inFlightCount = taskState?.inFlightCount ?? 0;
  const drainingCount = taskState?.drainingCount ?? 0;
  const lastTickAt = taskState?.lastTickAt ?? 0;

  // Derived from raw facts. `state.tick` re-renders the panel every dashboard
  // tick, which is what keeps these countdowns moving.
  const now = Date.now();
  const runningForMs = pipelineStartedAt > 0 ? now - pipelineStartedAt : 0;
  const firstLandingInMs = firstLandingTime > 0 ? firstLandingTime - now : 0;
  const tailInMs = latestLandingTime > now ? latestLandingTime - now : 0;
  const cascadeActive = firstLandingTime > 0 && firstLandingTime <= now;
  // Task ticks every 2 s; flag stalled if it's been over 6 s. Skip the flag
  // before the first publish (lastTickAt === 0 means no patch arrived yet).
  const stalled = lastTickAt > 0 && now - lastTickAt > 6000;

  // Current target's live security/money — read from the dashboard snapshot
  // so we don't keep stale fields in task state.
  const targetServer = useMemo(
    () => (target ? state.allServers.find((s) => s.hostname === target) : undefined),
    [target, state.allServers],
  );
  const targetCurrentSecurity = targetServer?.hackDifficulty ?? 0;
  const targetMinSecurity = targetServer?.minDifficulty ?? 0;
  const targetCurrentMoney = targetServer?.moneyAvailable ?? 0;
  const targetMaxMoney = targetServer?.moneyMax ?? 0;
  const securityComplete = targetCurrentSecurity <= targetMinSecurity + 1e-6;
  const moneyComplete = targetCurrentMoney >= targetMaxMoney - 1e-6;

  if (targetOptions.length === 0) {
    return <span style={{ color: colors.muted }}>No analysis yet — first scan pending.</span>;
  }

  const handleTarget = (hostname: string) => {
    ns.writePort(
      HACKING_SYSTEM_COMMUNICATION_PORT,
      JSON.stringify({ targetServer: hostname } satisfies UserCommunicationRequest),
    );
  };

  const handleUntarget = () => {
    ns.writePort(
      HACKING_SYSTEM_COMMUNICATION_PORT,
      JSON.stringify({ targetServer: undefined } satisfies UserCommunicationRequest),
    );
  };

  const renderAction = (row: ServerAnalysis): ReactNode => {
    if (row.hostname === target) {
      if (row.hostname === userTarget) {
        return (
          <Button onClick={handleUntarget}>
            <UntargetIcon color={colors.warn} title={`Un-target ${row.hostname}`} size={10} />
          </Button>
        );
      }
      return null;
    }
    return (
      <Button onClick={() => handleTarget(row.hostname)}>
        <TargetIcon color={colors.accent} title={`Target ${row.hostname}`} size={10} />
      </Button>
    );
  };

  return (
    <Col gap={space.sm}>
      <Row gap={space.lg} style={{ fontSize: "0.85em" }}>
        <span style={{ color: colors.muted }}>
          Target: <span style={{ color: colors.accent }}>{target || "—"}</span>
          {userTarget !== undefined && <span style={{ color: colors.muted }}> (user-pinned)</span>}
        </span>
        {!securityComplete && (
          <span style={{ color: colors.muted }}>
            sec:{" "}
            <span style={{ color: colors.hack }}>
              {ns.format.number((100 * targetMinSecurity) / targetCurrentSecurity, 0)}%
            </span>
          </span>
        )}
        {!moneyComplete && (
          <span style={{ color: colors.muted }}>
            $:{" "}
            <span style={{ color: colors.money }}>
              {ns.format.number((100 * targetCurrentMoney) / targetMaxMoney, 0)}%
            </span>
          </span>
        )}
        <span style={{ color: colors.muted, marginLeft: "auto" }}>
          Options: <span style={{ color: colors.fg }}>{targetOptions.length}</span>
        </span>
      </Row>

      <Row gap={space.lg} style={{ fontSize: "0.85em" }}>
        {stalled ? (
          <span style={{ color: colors.warn }}>
            ⚠ task stalled (no tick for {formatDuration(now - lastTickAt)})
          </span>
        ) : firstLandingTime === 0 ? (
          <span style={{ color: colors.muted }}>
            <span style={{ color: colors.fg }}>warming up</span> — no batches placed yet
          </span>
        ) : !cascadeActive ? (
          <span style={{ color: colors.muted }}>
            first landing in{" "}
            <span style={{ color: colors.accent }}>{formatDuration(firstLandingInMs)}</span>
          </span>
        ) : (
          <span style={{ color: colors.muted }}>
            <span style={{ color: colors.success }}>● cascade active</span>
            {tailInMs > 0 && (
              <>
                {" "}
                — tail in <span style={{ color: colors.fg }}>{formatDuration(tailInMs)}</span>
              </>
            )}
          </span>
        )}
        {inFlightCount > 0 && (
          <span style={{ color: colors.muted }}>
            in-flight: <span style={{ color: colors.fg }}>{inFlightCount}</span>
          </span>
        )}
        {drainingCount > 0 && (
          <span style={{ color: colors.muted }}>
            draining: <span style={{ color: colors.warn }}>{drainingCount}</span>
          </span>
        )}
        {pipelineStartedAt > 0 && (
          <span style={{ color: colors.muted, marginLeft: "auto" }}>
            running for <span style={{ color: colors.fg }}>{formatDuration(runningForMs)}</span>
          </span>
        )}
      </Row>

      <SortableTable<ServerAnalysis>
        columns={buildColumns(ns, colors, target)}
        rows={targetOptions}
        rowKey={(r) => r.hostname}
        actionColumn={{ width: 32, render: renderAction }}
        isCurrent={(r) => r.hostname === target}
        collapsible
        defaultSort={{ column: "profitPerSecond", direction: "desc" }}
        emptyMessage="No current target — task may still be selecting."
      />
    </Col>
  );
};
