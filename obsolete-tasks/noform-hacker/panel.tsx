import type { ReactNode } from "react";
import type { NS } from "@ns";
import { Button } from "../../../../../features/components/Button";
import { Col } from "../../../../../features/components/Col";
import { HackIcon, LockIcon, MoneyBagIcon, TargetIcon, UntargetIcon } from "../../../../../features/components/Icons";
import { Row } from "../../../../../features/components/Row";
import { SortableColumn, SortableTable } from "../../../../../features/components/SortableTable";
import { useDashboardController } from "../../../useDashboardController";
import {
  NOFORM_HACKER_TASK_ID,
  UserCommunicationRequest,
  type Phase,
  type ServerAnalysis,
  type NoformHackerTaskState,
} from "./info";
import { HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";
import { formatDuration } from "../../../formatting";
import { TaskCustomPanel } from "../tasks";
import { useTheme } from "../../../../../features/theme/ThemeProvider";
import { useNs } from "../../../../../features/ns/NsProvider";

type Theme = ReturnType<typeof useTheme>;

const buildColumns = (
  ns: NS,
  colors: Theme["colors"],
  currentSet: Set<string>,
  phaseByHost: Map<string, Phase>,
): SortableColumn<ServerAnalysis>[] => [
  {
    key: "hostname",
    label: "hostname",
    flex: 2,
    align: "left",
    accessor: (r) => r.hostname,
    render: (r) => {
      const isCurrent = currentSet.has(r.hostname);
      const phase = phaseByHost.get(r.hostname);
      return (
        <span
          style={{
            color: isCurrent ? colors.info : colors.primary,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {r.hostname}
          {phase === "fix_security" && (
            <LockIcon color={colors.info} title={`${r.hostname}: lowering security`} />
          )}
          {phase === "fix_money" && (
            <MoneyBagIcon color={colors.info} title={`${r.hostname}: growing money`} />
          )}
          {phase === "hack" && <HackIcon color={colors.code} title={`${r.hostname}: hacking`} />}
        </span>
      );
    },
  },
  {
    key: "hackChance",
    label: "hack chance",
    flex: 1,
    align: "right",
    accessor: (r) => r.hackChance,
    render: (r) => <span style={{ color: colors.primary }}>{ns.format.percent(r.hackChance, 1)}</span>,
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
    key: "maxTime",
    label: "time",
    flex: 1,
    align: "right",
    accessor: (r) => r.maxTime,
    render: (r) => <span style={{ color: colors.primary }}>{formatDuration(r.maxTime)}</span>,
  },
  {
    key: "profitScore",
    label: "priority",
    flex: 1,
    align: "right",
    accessor: (r) => r.profitScore,
    render: (r) => <span style={{ color: colors.primary }}>{ns.format.number(r.profitScore)}</span>,
  },
];

export const NoformHackerPanel: TaskCustomPanel = () => {
  const theme = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();

  const taskState = state.tasks[NOFORM_HACKER_TASK_ID] as unknown as
    | NoformHackerTaskState
    | undefined;
  const report = taskState?.targetReport;
  const currentTargets = taskState?.currentTargets ?? [];
  const userTargets = taskState?.userTargets ?? [];

  if (!report || report.analysis.length === 0) {
    return <span style={{ color: theme.colors.secondary }}>No analysis yet — first scan pending.</span>;
  }

  const currentSet = new Set(currentTargets.map((t) => t.hostname));
  const phaseByHost = new Map(currentTargets.map((t) => [t.hostname, t.phase]));
  const userSet = new Set(userTargets);
  const totalCount = report.analysis.length;

  const handleTarget = (hostname: string) => {
    ns.writePort(
      HACKING_SYSTEM_COMMUNICATION_PORT,
      JSON.stringify({
        targetServers: [hostname],
      } satisfies UserCommunicationRequest),
    );
  };

  const handleUntarget = (hostname: string) => {
    ns.writePort(
      HACKING_SYSTEM_COMMUNICATION_PORT,
      JSON.stringify({
        targetServers: currentTargets.filter((t) => t.hostname !== hostname).map((t) => t.hostname),
      } satisfies UserCommunicationRequest),
    );
  };

  const ageSeconds = Math.max(0, Math.floor((Date.now() - report.ranAt) / 1000));
  const ageLabel =
    ageSeconds < 60
      ? `${ageSeconds}s ago`
      : ageSeconds < 3600
        ? `${Math.floor(ageSeconds / 60)}m ago`
        : `${Math.floor(ageSeconds / 3600)}h ago`;

  const renderAction = (row: ServerAnalysis): ReactNode => {
    const isCurrent = currentSet.has(row.hostname);
    const isUserTarget = userSet.has(row.hostname);
    if (isCurrent) {
      if (isUserTarget) {
        return (
          <Button onClick={() => handleUntarget(row.hostname)}>
            <UntargetIcon color={theme.colors.warning} title={`Un-target ${row.hostname}`} size={10} />
          </Button>
        );
      }
      return null;
    }
    return (
      <Button onClick={() => handleTarget(row.hostname)}>
        <TargetIcon color={theme.colors.info} title={`Target ${row.hostname}`} size={10} />
      </Button>
    );
  };

  return (
    <Col gap={theme.spacing.sm}>
      <Row gap={theme.spacing.lg} style={{ fontSize: "0.85em" }}>
        <span style={{ color: theme.colors.secondary }}>
          Last scan: <span style={{ color: theme.colors.primary }}>{ageLabel}</span>
        </span>
        <span style={{ color: theme.colors.secondary }}>
          Targets: <span style={{ color: theme.colors.info }}>{currentTargets.length}</span>
          <span style={{ color: theme.colors.secondary }}> / </span>
          <span style={{ color: theme.colors.primary }}>{totalCount}</span>
        </span>
      </Row>

      <SortableTable<ServerAnalysis>
        columns={buildColumns(ns, theme.colors, currentSet, phaseByHost)}
        rows={report.analysis}
        rowKey={(r) => r.hostname}
        actionColumn={{ width: 32, render: renderAction }}
        isCurrent={(r) => currentSet.has(r.hostname)}
        collapsible
        emptyMessage="No current targets — task may still be selecting."
      />
    </Col>
  );
};
