import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Col } from "./Col";
import { ChevronDownIcon, ChevronUpDownIcon, ChevronUpIcon } from "./Icons";
import { Row } from "./Row";
import { useTheme } from "./theme";

type Align = "left" | "right";
type SortDirection = "asc" | "desc";
type SortState = { column: string; direction: SortDirection } | null;

export interface SortableColumn<T> {
  key: string;
  label: string;
  flex: number;
  align: Align;
  accessor: (row: T) => string | number;
  render: (row: T) => ReactNode;
  sortable?: boolean;
}

export interface SortableTableProps<T> {
  columns: SortableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  actionColumn?: { width: number; render: (row: T) => ReactNode };
  isCurrent?: (row: T) => boolean;
  collapsible?: boolean;
  defaultSort?: { column: string; direction: SortDirection };
  emptyMessage?: ReactNode;
}

export function SortableTable<T>({
  columns,
  rows,
  rowKey,
  actionColumn,
  isCurrent,
  collapsible = false,
  defaultSort,
  emptyMessage,
}: SortableTableProps<T>) {
  const { colors, space } = useTheme();
  const [sort, setSort] = useState<SortState>(defaultSort ?? null);
  const [expanded, setExpanded] = useState(false);

  const currentCount = isCurrent ? rows.filter(isCurrent).length : 0;
  const showAll = !collapsible || expanded || !isCurrent;
  const visibleRows = showAll ? rows : rows.filter(isCurrent!);

  const columnByKey = new Map(columns.map((c) => [c.key, c]));
  const sortedRows = sort
    ? [...visibleRows].sort((a, b) => {
        const col = columnByKey.get(sort.column);
        if (!col) return 0;
        const av = col.accessor(a);
        const bv = col.accessor(b);
        const cmp =
          typeof av === "string" && typeof bv === "string"
            ? av.localeCompare(bv)
            : (av as number) - (bv as number);
        return sort.direction === "asc" ? cmp : -cmp;
      })
    : visibleRows;

  const handleHeaderClick = (column: string) => {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  };

  const renderHeader = (col: SortableColumn<T>) => {
    const sortable = col.sortable !== false;
    const isActive = sortable && sort?.column === col.key;
    const direction = isActive ? sort!.direction : null;
    const chevronColor = isActive ? colors.accent : colors.fgDim;
    const chevron = !sortable ? null : direction === "asc" ? (
      <ChevronUpIcon color={chevronColor} size={10} />
    ) : direction === "desc" ? (
      <ChevronDownIcon color={chevronColor} size={10} />
    ) : (
      <ChevronUpDownIcon color={chevronColor} size={10} />
    );
    return (
      <span
        key={col.key}
        onClick={sortable ? () => handleHeaderClick(col.key) : undefined}
        style={{
          color: isActive ? colors.fg : colors.muted,
          flex: col.flex,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: col.align === "right" ? "flex-end" : "flex-start",
          gap: 4,
          cursor: sortable ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        {col.label}
        {chevron}
      </span>
    );
  };

  const showToggle = collapsible && isCurrent && rows.length > currentCount;

  return (
    <Col gap={space.xs}>
      <Row
        gap={space.md}
        style={{
          borderBottom: `1px solid ${colors.fgDim}`,
          paddingBottom: space.xs,
          fontSize: "0.85em",
        }}
      >
        {actionColumn && <span style={{ width: actionColumn.width, flexShrink: 0 }} />}
        {columns.map(renderHeader)}
      </Row>
      {sortedRows.length === 0 ? (
        emptyMessage ? (
          <span style={{ color: colors.muted, fontSize: "0.85em" }}>{emptyMessage}</span>
        ) : null
      ) : (
        sortedRows.map((row) => (
          <Row key={rowKey(row)} gap={space.md} style={{ fontSize: "0.85em" }}>
            {actionColumn && (
              <span
                style={{
                  width: actionColumn.width,
                  flexShrink: 0,
                  display: "inline-flex",
                }}
              >
                {actionColumn.render(row)}
              </span>
            )}
            {columns.map((col) => (
              <span
                key={col.key}
                style={{
                  flex: col.flex,
                  textAlign: col.align,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: col.align === "right" ? "flex-end" : "flex-start",
                  gap: 4,
                }}
              >
                {col.render(row)}
              </span>
            ))}
          </Row>
        ))
      )}
      {showToggle && (
        <Row style={{ marginTop: space.xs }}>
          <Button onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Collapse to current" : `Show all (${rows.length})`}
          </Button>
        </Row>
      )}
    </Col>
  );
}
