import { useState } from "react";
import type { TaskCustomPanel } from "../../../../features/taskCustomPanels";
import { Button } from "../../../../ui/Button";
import { Col } from "../../../../ui/Col";
import {
  ChevronDownIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  TargetIcon,
  UntargetIcon,
} from "../../../../ui/Icons";
import { Row } from "../../../../ui/Row";
import { useTheme } from "../../../../ui/theme";
import { useNs } from "../../../ns";
import { useDashboardController } from "../../../useDashboardController";
import {
  NOFORM_HACKER_TASK_ID,
  UserCommunicationRequest,
  type NoformHackerTaskState,
} from "./info";
import { HACKING_SYSTEM_COMMUNICATION_PORT } from "../../../ports";
import { formatDuration } from "../../../formatting";

type SortColumn = "hostname" | "hackChance" | "maxMoney" | "maxTime" | "profitScore";
type SortDirection = "asc" | "desc";
type SortState = { column: SortColumn; direction: SortDirection } | null;

export const NoformHackerPanel: TaskCustomPanel = () => {
  const { colors, space } = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();
  const [expanded, setExpanded] = useState(false);
  const [sort, setSort] = useState<SortState>(null);

  const taskState = state.tasks[NOFORM_HACKER_TASK_ID] as unknown as
    | NoformHackerTaskState
    | undefined;
  const report = taskState?.targetReport;
  const currentTargets = taskState?.currentTargets ?? [];
  const userTargets = taskState?.userTargets ?? [];

  if (!report || report.analysis.length === 0) {
    return <span style={{ color: colors.muted }}>No analysis yet — first scan pending.</span>;
  }

  const currentSet = new Set(currentTargets);
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
        targetServers: currentTargets.filter((t) => t !== hostname),
      } satisfies UserCommunicationRequest),
    );
  };

  const visibleRows = expanded
    ? report.analysis
    : report.analysis.filter((a) => currentSet.has(a.hostname));

  const rows = sort
    ? [...visibleRows].sort((a, b) => {
        const av = a[sort.column];
        const bv = b[sort.column];
        const cmp =
          typeof av === "string" && typeof bv === "string"
            ? av.localeCompare(bv)
            : (av as number) - (bv as number);
        return sort.direction === "asc" ? cmp : -cmp;
      })
    : visibleRows;

  const handleHeaderClick = (column: SortColumn) => {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  };

  const renderHeader = (
    label: string,
    column: SortColumn,
    flex: number,
    align: "left" | "right",
  ) => {
    const isActive = sort?.column === column;
    const direction = isActive ? sort!.direction : null;
    const chevronColor = isActive ? colors.accent : colors.fgDim;
    const chevron =
      direction === "asc" ? (
        <ChevronUpIcon color={chevronColor} size={10} />
      ) : direction === "desc" ? (
        <ChevronDownIcon color={chevronColor} size={10} />
      ) : (
        <ChevronUpDownIcon color={chevronColor} size={10} />
      );
    return (
      <span
        onClick={() => handleHeaderClick(column)}
        style={{
          color: isActive ? colors.fg : colors.muted,
          flex,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: align === "right" ? "flex-end" : "flex-start",
          gap: 4,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {label}
        {chevron}
      </span>
    );
  };

  const ageSeconds = Math.max(0, Math.floor((Date.now() - report.ranAt) / 1000));
  const ageLabel =
    ageSeconds < 60
      ? `${ageSeconds}s ago`
      : ageSeconds < 3600
        ? `${Math.floor(ageSeconds / 60)}m ago`
        : `${Math.floor(ageSeconds / 3600)}h ago`;

  return (
    <Col gap={space.sm}>
      <Row gap={space.lg} style={{ fontSize: "0.85em" }}>
        <span style={{ color: colors.muted }}>
          Last scan: <span style={{ color: colors.fg }}>{ageLabel}</span>
        </span>
        <span style={{ color: colors.muted }}>
          Targets: <span style={{ color: colors.accent }}>{currentTargets.length}</span>
          <span style={{ color: colors.muted }}> / </span>
          <span style={{ color: colors.fg }}>{totalCount}</span>
        </span>
      </Row>

      <Col gap={space.xs}>
        <Row
          gap={space.md}
          style={{
            borderBottom: `1px solid ${colors.fgDim}`,
            paddingBottom: space.xs,
            fontSize: "0.85em",
          }}
        >
          <span style={{ width: 32, flexShrink: 0 }} />
          {renderHeader("hostname", "hostname", 2, "left")}
          {renderHeader("hack chance", "hackChance", 1, "right")}
          {renderHeader("max money", "maxMoney", 1, "right")}
          {renderHeader("time", "maxTime", 1, "right")}
          {renderHeader("priority", "profitScore", 1, "right")}
        </Row>
        {rows.length === 0 ? (
          <span style={{ color: colors.muted, fontSize: "0.85em" }}>
            No current targets — task may still be selecting.
          </span>
        ) : (
          rows.map((row) => {
            const isCurrent = currentSet.has(row.hostname);
            const isUserTarget = userSet.has(row.hostname);

            return (
              <Row key={row.hostname} gap={space.md} style={{ fontSize: "0.85em" }}>
                <span style={{ width: 32, flexShrink: 0, display: "inline-flex" }}>
                  {isCurrent ? (
                    isUserTarget ? (
                      <Button onClick={() => handleUntarget(row.hostname)}>
                        <UntargetIcon
                          color={colors.warn}
                          title={`Un-target ${row.hostname}`}
                          size={10}
                        />
                      </Button>
                    ) : undefined
                  ) : (
                    <Button onClick={() => handleTarget(row.hostname)}>
                      <TargetIcon
                        color={colors.accent}
                        title={`Target ${row.hostname}`}
                        size={10}
                      />
                    </Button>
                  )}
                </span>
                <span style={{ color: isCurrent ? colors.accent : colors.fg, flex: 2 }}>
                  {row.hostname}
                </span>
                <span style={{ color: colors.fg, flex: 1, textAlign: "right" }}>
                  {ns.format.percent(row.hackChance, 1)}
                </span>
                <span style={{ color: colors.money, flex: 1, textAlign: "right" }}>
                  ${ns.format.number(row.maxMoney, 0)}
                </span>
                <span style={{ color: colors.fg, flex: 1, textAlign: "right" }}>
                  {formatDuration(row.maxTime)}
                </span>
                <span style={{ color: colors.fg, flex: 1, textAlign: "right" }}>
                  {ns.format.number(row.profitScore)}
                </span>
              </Row>
            );
          })
        )}
      </Col>

      {totalCount > currentTargets.length && (
        <Row style={{ marginTop: space.xs }}>
          <Button onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Collapse to current targets" : `Show all (${totalCount})`}
          </Button>
        </Row>
      )}
    </Col>
  );
};
