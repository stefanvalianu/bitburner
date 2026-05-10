import { useState } from "react";
import type { TaskCustomPanel } from "../../../../features/taskCustomPanels";
import { Button } from "../../../../ui/Button";
import { Col } from "../../../../ui/Col";
import { TargetIcon } from "../../../../ui/Icons";
import { Row } from "../../../../ui/Row";
import { useTheme } from "../../../../ui/theme";
import { useNs } from "../../../ns";
import { useDashboardController } from "../../../useDashboardController";
import { NOFORM_HACKER_TASK_ID, type NoformHackerTaskState } from "./info";

export const NoformHackerPanel: TaskCustomPanel = () => {
  const { colors, space } = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();
  const [expanded, setExpanded] = useState(false);

  const taskState = state.tasks[NOFORM_HACKER_TASK_ID] as unknown as
    | NoformHackerTaskState
    | undefined;
  const report = taskState?.targetReport;
  const currentTargets = taskState?.currentTargets ?? [];

  if (!report || report.analysis.length === 0) {
    return <span style={{ color: colors.muted }}>No analysis yet — first scan pending.</span>;
  }

  const currentSet = new Set(currentTargets);
  const totalCount = report.analysis.length;

  const handleTarget = (hostname: string) => {
    // user wants to change this target, let's write 
  };

  const rows = expanded
    ? report.analysis
    : report.analysis.filter((a) => currentSet.has(a.hostname));

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
          <span style={{ color: colors.muted, flex: 2 }}>hostname</span>
          <span style={{ color: colors.muted, flex: 1, textAlign: "right" }}>hack chance</span>
          <span style={{ color: colors.muted, flex: 1, textAlign: "right" }}>max money</span>
          <span style={{ color: colors.muted, flex: 1, textAlign: "right" }}>time</span>
          <span style={{ color: colors.muted, flex: 1, textAlign: "right" }}>priority</span>
        </Row>
        {rows.length === 0 ? (
          <span style={{ color: colors.muted, fontSize: "0.85em" }}>
            No current targets — task may still be selecting.
          </span>
        ) : (
          rows.map((row) => {
            const isCurrent = currentSet.has(row.hostname);
            return (
              <Row key={row.hostname} gap={space.md} style={{ fontSize: "0.85em" }}>
                <span style={{ width: 32, flexShrink: 0, display: "inline-flex" }}>
                  {!isCurrent && (
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
                  {ns.format.time(row.maxTime)}
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
