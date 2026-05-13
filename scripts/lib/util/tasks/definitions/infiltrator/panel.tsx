import type { NS, InfiltrationLocation } from "@ns";
import { Col } from "../../../../ui/Col";
import { Row } from "../../../../ui/Row";
import { SortableColumn, SortableTable } from "../../../../ui/SortableTable";
import { useTheme } from "../../../../ui/theme";
import { useNs } from "../../../ns";
import { useDashboardController } from "../../../useDashboardController";
import { INFILTRATOR_TASK_ID, type InfiltratorTaskState } from "./info";
import { TaskCustomPanel } from "../tasks";

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
  const { state } = useDashboardController();

  const taskState = state.tasks[INFILTRATOR_TASK_ID] as unknown as InfiltratorTaskState | undefined;
  const infiltrations = taskState?.infiltrations ?? [];

  if (infiltrations.length === 0) {
    return (
      <span style={{ color: colors.muted }}>
        No infiltrations scanned yet — first refresh pending.
      </span>
    );
  }

  return (
    <Col gap={space.sm}>
      <SortableTable<InfiltrationLocation>
        columns={buildColumns(ns, colors)}
        rows={infiltrations}
        rowKey={(r) => r.location.name}
        collapsible
        collapsedRows={3}
        defaultSort={{ column: "difficulty", direction: "asc" }}
      />
    </Col>
  );
};
