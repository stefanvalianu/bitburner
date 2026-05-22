import { NS } from "@ns";
import { getPortData, INFILTRATOR_STATE_PORT } from "@repo/common/ports";
import { Col } from "@repo/features/components/Col";
import { SortableColumn, SortableTable } from "@repo/features/components/SortableTable";
import { useNs } from "@repo/features/ns/NsProvider";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { TaskCustomPanel } from "@repo/tasks";
import { InfiltrationOption, InfiltratorTaskState } from "@repo/tasks/infiltrator/info";

type Theme = ReturnType<typeof useTheme>;

const buildColumns = (ns: NS, colors: Theme["colors"]): SortableColumn<InfiltrationOption>[] => [
  {
    key: "location",
    label: "location",
    align: "left",
    flex: 2,
    accessor: (r) => r.location.name,
    render: (r) => <span style={{ color: r.canAttempt ? colors.primary : colors.secondary }}>{r.location.name}</span>,
  },
  {
    key: "city",
    label: "city",
    align: "left",
    flex: 1,
    accessor: (r) => r.location.city,
    render: (r) => <span style={{ color: r.canAttempt ? colors.primary : colors.secondary }}>{r.location.city}</span>,
  },
  {
    key: "difficulty",
    label: "difficulty",
    align: "right",
    flex: 1,
    accessor: (r) => r.difficulty,
    render: (r) => <span style={{ color: r.canAttempt ? colors.primary : colors.secondary }}>{ns.format.number(r.difficulty, 2)}</span>,
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
    render: (r) => <span style={{ color: colors.rep }}>{ns.format.number(r.reward.tradeRep)}</span>,
  },
];

export const InfiltratorPanel: TaskCustomPanel = () => {
  const theme = useTheme();
  const ns = useNs();

  const state = getPortData<InfiltratorTaskState>(ns, INFILTRATOR_STATE_PORT);
  const infiltrations = state?.infiltrations ?? [];

  return (
    <Col gap={theme.spacing.sm}>
      {infiltrations.length === 0 ? (
        <span style={{ color: theme.colors.secondary }}>
          No infiltrations scanned yet — first refresh pending.
        </span>
      ) : (
        <SortableTable<InfiltrationOption>
          columns={buildColumns(ns, theme.colors)}
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
