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
  ULTRAHACKER_TASK_ID,
  UserCommunicationRequest,
  type FramePurpose,
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
    render: (r) => (
      <span style={{ color: colors.hack }}>{ns.format.number(r.xpPerSecond, 2)}</span>
    ),
  },
];

export const UltrahackerPanel: TaskCustomPanel = () => {
  const { colors, space } = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();

  const taskState = state.tasks[ULTRAHACKER_TASK_ID] as unknown as UltrahackerTaskState | undefined;
  const targetOptions = taskState?.targetOptions ?? [];
  const target = taskState?.target ?? "";
  const userTarget = taskState?.userTarget;
  const batches = taskState?.batches ?? [];
  const targetCurrentSecurity = taskState?.targetCurrentSecurity ?? 0;
  const targetMinSecurity = taskState?.targetMinSecurity ?? 0;
  const targetCurrentMoney = taskState?.targetCurrentMoney ?? 0;
  const targetMaxMoney = taskState?.targetMaxMoney ?? 0;
  const estimatedFinishTime = taskState?.estimatedFinishTime ?? 0;
  const securityComplete = targetCurrentSecurity <= targetMinSecurity + 1e-6;
  const moneyComplete = targetCurrentMoney >= targetMaxMoney - 1e-6;
  const remainingMs = Math.max(0, estimatedFinishTime - Date.now());

  const colorForPurpose = (p: FramePurpose): string => {
    switch (p) {
      case "W":
        return colors.success;
      case "GW":
        return colors.money;
      case "HWGW":
        return colors.muted;
    }
  };

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
        <span style={{ color: colors.muted }}>
          <span style={{ color: colors.fg }}>{ns.format.time(remainingMs)}</span> remaining
        </span>
        <span style={{ color: colors.muted, marginLeft: "auto" }}>
          Options: <span style={{ color: colors.fg }}>{targetOptions.length}</span>
        </span>
      </Row>

      {batches.length > 0 && (
        <Col gap={space.xs}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {batches.map((purpose, i) => (
              <div
                key={i}
                title={purpose}
                style={{
                  width: 8,
                  height: 8,
                  background: colorForPurpose(purpose),
                }}
              />
            ))}
          </div>
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
                <span style={{ width: 8, height: 8, background: colorForPurpose(p) }} />
                {p}
              </span>
            ))}
          </Row>
        </Col>
      )}

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
