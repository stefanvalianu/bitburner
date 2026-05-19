import type { ReactNode } from "react";
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
  ULTRAHACKER_V2_TASK_ID,
  UserCommunicationRequest,
  type FramePurpose,
  type PipelineSnapshot,
  type ServerAnalysis,
  type UltrahackerV2TaskState,
} from "./info";

type Theme = ReturnType<typeof useTheme>;

const buildColumns = (
  ns: NS,
  colors: Theme["colors"],
  activeTargets: Set<string>,
  primaryTarget: string,
): SortableColumn<ServerAnalysis>[] => [
  {
    key: "hostname",
    label: "hostname",
    flex: 2,
    align: "left",
    accessor: (r) => r.hostname,
    render: (r) => (
      <span style={{ color: activeTargets.has(r.hostname) ? colors.accent : colors.fg }}>
        {r.hostname}
        {r.hostname === primaryTarget ? " ★" : ""}
      </span>
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

const colorForPurpose = (colors: Theme["colors"], p: FramePurpose): string => {
  switch (p) {
    case "W":
      return colors.success;
    case "GW":
      return colors.money;
    case "HWGW":
      return colors.muted;
  }
};

const PipelineRow = ({
  pipeline,
  colors,
  ns,
}: {
  pipeline: PipelineSnapshot;
  colors: Theme["colors"];
  ns: NS;
}) => {
  const securityComplete = pipeline.targetCurrentSecurity <= pipeline.targetMinSecurity + 1e-6;
  const moneyComplete = pipeline.targetCurrentMoney >= pipeline.targetMaxMoney - 1e-6;
  const remainingMs = Math.max(0, pipeline.soonestFinishEpoch - Date.now());
  const depthPct =
    pipeline.maxDepth > 0
      ? Math.min(100, Math.round((100 * pipeline.inFlightCount) / pipeline.maxDepth))
      : 0;

  return (
    <Col gap={2} style={{ fontSize: "0.85em" }}>
      <Row gap={12} style={{ alignItems: "center" }}>
        <span style={{ color: colors.accent, minWidth: 140 }}>{pipeline.target}</span>
        {pipeline.healing && (
          <span style={{ color: colors.warn }} title="Healing: drift detected, draining batches">
            healing
          </span>
        )}
        {!securityComplete && (
          <span style={{ color: colors.muted }}>
            sec:{" "}
            <span style={{ color: colors.hack }}>
              {ns.format.number(
                (100 * pipeline.targetMinSecurity) / Math.max(1e-9, pipeline.targetCurrentSecurity),
                0,
              )}
              %
            </span>
          </span>
        )}
        {!moneyComplete && (
          <span style={{ color: colors.muted }}>
            $:{" "}
            <span style={{ color: colors.money }}>
              {ns.format.number(
                (100 * pipeline.targetCurrentMoney) / Math.max(1, pipeline.targetMaxMoney),
                0,
              )}
              %
            </span>
          </span>
        )}
        <span style={{ color: colors.muted }}>
          depth:{" "}
          <span style={{ color: colors.fg }}>
            {pipeline.inFlightCount}/{pipeline.maxDepth}
          </span>{" "}
          ({depthPct}%)
        </span>
        {remainingMs > 0 && (
          <span style={{ color: colors.muted }}>
            next: <span style={{ color: colors.fg }}>{ns.format.time(remainingMs)}</span>
          </span>
        )}
      </Row>
      {pipeline.recentBatches.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {pipeline.recentBatches.map((purpose, i) => (
            <div
              key={i}
              title={purpose}
              style={{
                width: 6,
                height: 6,
                background: colorForPurpose(colors, purpose),
              }}
            />
          ))}
        </div>
      )}
    </Col>
  );
};

export const UltrahackerV2Panel: TaskCustomPanel = () => {
  const { colors, space } = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();

  const taskState = state.tasks[ULTRAHACKER_V2_TASK_ID] as unknown as
    | UltrahackerV2TaskState
    | undefined;
  const targetOptions = taskState?.targetOptions ?? [];
  const pipelines = taskState?.pipelines ?? [];
  const userTarget = taskState?.userTarget;
  const primaryTarget = pipelines[0]?.target ?? "";
  const activeTargets = new Set(pipelines.map((p) => p.target));

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
    if (row.hostname === userTarget) {
      return (
        <Button onClick={handleUntarget}>
          <UntargetIcon color={colors.warn} title={`Un-target ${row.hostname}`} size={10} />
        </Button>
      );
    }
    if (activeTargets.has(row.hostname)) return null;
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
          Pipelines: <span style={{ color: colors.fg }}>{pipelines.length}</span>
        </span>
        {userTarget !== undefined && (
          <span style={{ color: colors.muted }}>
            pinned: <span style={{ color: colors.accent }}>{userTarget}</span>
          </span>
        )}
        <span style={{ color: colors.muted, marginLeft: "auto" }}>
          Options: <span style={{ color: colors.fg }}>{targetOptions.length}</span>
        </span>
      </Row>

      {pipelines.length > 0 && (
        <Col gap={space.xs}>
          {pipelines.map((p) => (
            <PipelineRow key={p.target} pipeline={p} colors={colors} ns={ns} />
          ))}
          <Row gap={space.md} style={{ fontSize: "0.75em" }}>
            {(["W", "GW", "HWGW"] as const).map((p) => (
              <span
                key={p}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: colors.muted,
                }}
              >
                <span style={{ width: 8, height: 8, background: colorForPurpose(colors, p) }} />
                {p}
              </span>
            ))}
          </Row>
        </Col>
      )}

      <SortableTable<ServerAnalysis>
        columns={buildColumns(ns, colors, activeTargets, primaryTarget)}
        rows={targetOptions}
        rowKey={(r) => r.hostname}
        actionColumn={{ width: 32, render: renderAction }}
        isCurrent={(r) => activeTargets.has(r.hostname)}
        collapsible
        defaultSort={{ column: "profitPerSecond", direction: "desc" }}
        emptyMessage="No current target — task may still be selecting."
      />
    </Col>
  );
};
