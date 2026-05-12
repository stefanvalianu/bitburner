import { useState } from "react";
import type { ReactNode } from "react";
import type { NS } from "@ns";
import { Col } from "../../../../ui/Col";
import {
  ChevronDownIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
} from "../../../../ui/Icons";
import { Row } from "../../../../ui/Row";
import { useTheme } from "../../../../ui/theme";
import { useNs } from "../../../ns";
import { useDashboardController } from "../../../useDashboardController";
import { INFILTRATOR_TASK_ID, type InfiltratorTaskState } from "./info";
import type { InfiltrationLocation } from "@ns";
import { TaskCustomPanel } from "../tasks";

type SortColumn =
  | "location"
  | "city"
  | "difficulty"
  | "maxClearance"
  | "startingSecurity"
  | "sellCash"
  | "tradeRep"
  | "soaRep";
type SortDirection = "asc" | "desc";
type SortState = { column: SortColumn; direction: SortDirection } | null;

type Column = {
  key: SortColumn;
  label: string;
  align: "left" | "right";
  flex: number;
  accessor: (row: InfiltrationLocation) => string | number;
  format: (row: InfiltrationLocation, ns: NS, colors: ReturnType<typeof useTheme>["colors"]) => ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "location",
    label: "location",
    align: "left",
    flex: 2,
    accessor: (r) => r.location.name,
    format: (r, _ns, colors) => (
      <span style={{ color: colors.fg }}>{r.location.name}</span>
    ),
  },
  {
    key: "city",
    label: "city",
    align: "left",
    flex: 1,
    accessor: (r) => r.location.city,
    format: (r, _ns, colors) => (
      <span style={{ color: colors.fg }}>{r.location.city}</span>
    ),
  },
  {
    key: "difficulty",
    label: "difficulty",
    align: "right",
    flex: 1,
    accessor: (r) => r.difficulty,
    format: (r, ns, colors) => (
      <span style={{ color: colors.fg }}>{ns.format.number(r.difficulty, 2)}</span>
    ),
  },
  {
    key: "maxClearance",
    label: "max clearance",
    align: "right",
    flex: 1,
    accessor: (r) => r.maxClearanceLevel,
    format: (r, ns, colors) => (
      <span style={{ color: colors.fg }}>{ns.format.number(r.maxClearanceLevel, 0)}</span>
    ),
  },
  {
    key: "startingSecurity",
    label: "start sec",
    align: "right",
    flex: 1,
    accessor: (r) => r.startingSecurityLevel,
    format: (r, ns, colors) => (
      <span style={{ color: colors.fg }}>{ns.format.number(r.startingSecurityLevel, 2)}</span>
    ),
  },
  {
    key: "sellCash",
    label: "sell cash",
    align: "right",
    flex: 1,
    accessor: (r) => r.reward.sellCash,
    format: (r, ns, colors) => (
      <span style={{ color: colors.money }}>${ns.format.number(r.reward.sellCash, 0)}</span>
    ),
  },
  {
    key: "tradeRep",
    label: "trade rep",
    align: "right",
    flex: 1,
    accessor: (r) => r.reward.tradeRep,
    format: (r, ns, colors) => (
      <span style={{ color: colors.fg }}>{ns.format.number(r.reward.tradeRep)}</span>
    ),
  },
  {
    key: "soaRep",
    label: "SoA rep",
    align: "right",
    flex: 1,
    accessor: (r) => r.reward.SoARep,
    format: (r, ns, colors) => (
      <span style={{ color: colors.fg }}>{ns.format.number(r.reward.SoARep)}</span>
    ),
  },
];

export const InfiltratorPanel: TaskCustomPanel = () => {
  const { colors, space } = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();
  const [sort, setSort] = useState<SortState>({ column: "difficulty", direction: "asc" });

  const taskState = state.tasks[INFILTRATOR_TASK_ID] as unknown as
    | InfiltratorTaskState
    | undefined;
  const infiltrations = taskState?.infiltrations ?? [];

  if (infiltrations.length === 0) {
    return (
      <span style={{ color: colors.muted }}>
        No infiltrations scanned yet — first refresh pending.
      </span>
    );
  }

  const columnByKey = new Map(COLUMNS.map((c) => [c.key, c]));
  const rows = sort
    ? [...infiltrations].sort((a, b) => {
        const col = columnByKey.get(sort.column)!;
        const av = col.accessor(a);
        const bv = col.accessor(b);
        const cmp =
          typeof av === "string" && typeof bv === "string"
            ? av.localeCompare(bv)
            : (av as number) - (bv as number);
        return sort.direction === "asc" ? cmp : -cmp;
      })
    : infiltrations;

  const handleHeaderClick = (column: SortColumn) => {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  };

  const renderHeader = (col: Column) => {
    const isActive = sort?.column === col.key;
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
        key={col.key}
        onClick={() => handleHeaderClick(col.key)}
        style={{
          color: isActive ? colors.fg : colors.muted,
          flex: col.flex,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: col.align === "right" ? "flex-end" : "flex-start",
          gap: 4,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {col.label}
        {chevron}
      </span>
    );
  };

  return (
    <Col gap={space.sm}>
      <Row gap={space.lg} style={{ fontSize: "0.85em" }}>
        <span style={{ color: colors.muted }}>
          Locations: <span style={{ color: colors.fg }}>{infiltrations.length}</span>
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
          {COLUMNS.map(renderHeader)}
        </Row>
        {rows.map((row) => (
          <Row key={row.location.name} gap={space.md} style={{ fontSize: "0.85em" }}>
            {COLUMNS.map((col) => (
              <span
                key={col.key}
                style={{
                  flex: col.flex,
                  textAlign: col.align,
                  display: "inline-block",
                }}
              >
                {col.format(row, ns, colors)}
              </span>
            ))}
          </Row>
        ))}
      </Col>
    </Col>
  );
};
