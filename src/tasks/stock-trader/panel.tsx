import type { NS } from "@ns";
import { Col } from "../../../../../features/components/Col";
import { Row } from "../../../../../features/components/Row";
import { StatRow } from "../../../../../features/components/StatRow";
import { useDashboardController } from "../../../useDashboardController";
import { formatDuration } from "../../../formatting";
import { TaskCustomPanel } from "../tasks";
import {
  MarketView,
  PositionView,
  STOCK_TRADER_CONFIG,
  STOCK_TRADER_TASK_ID,
  StockTraderTaskState,
  TradeAction,
} from "./info";
import { useTheme } from "../../../../../features/theme/ThemeProvider";
import { useNs } from "../../../../../features/ns/NsProvider";

const TOP_OPPORTUNITIES = 5;
const RECENT_ACTIONS_SHOWN = 10;
// Mirrors ns.stock.getConstants().StockMarketCommission. Hardcoded in the
// panel so we don't need NS RAM cost to read it — it's a game constant.
const STOCK_TRADER_OPEN_COMMISSION = 100_000;

type Theme = ReturnType<typeof useTheme>;

function formatMoney(ns: NS, value: number): string {
  if (value < 0) return `-$${ns.format.number(-value, 2)}`;
  return `$${ns.format.number(value, 2)}`;
}

export const StockTraderPanel: TaskCustomPanel = () => {
  const theme = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();

  const taskState = state.tasks[STOCK_TRADER_TASK_ID] as unknown as
    | StockTraderTaskState
    | undefined;

  if (!taskState) {
    return <span style={{ color: theme.colors.secondary }}>Stock trader not running.</span>;
  }
  if (!taskState.has4SApi) {
    return <span style={{ color: theme.colors.secondary }}>Waiting for 4S Market Data API…</span>;
  }

  const positions = taskState.positions ?? [];
  const market = taskState.market ?? [];
  const recentActions = taskState.recentActions ?? [];
  const totals = taskState.totals;

  const portfolioValue = positions.reduce((s, p) => s + p.shares * p.bidPrice, 0);
  const unrealized = positions.reduce((s, p) => s + (p.bidPrice - p.avgPrice) * p.shares, 0);
  // Net P&L includes commissions paid for currently-open positions, which
  // are sunk costs that won't appear in `realizedPnL` until those positions
  // close. Subtracting them gives an honest "what would I have if I sold
  // everything right now" answer.
  const openCommissions = positions.length * STOCK_TRADER_OPEN_COMMISSION;
  const netPnL = totals.realizedPnL + unrealized - openCommissions;

  const sessionMs = Math.max(1, Date.now() - taskState.sessionStartedAt);
  const pnlPerHour = (netPnL * 3_600_000) / sessionMs;

  const closedTrades = totals.winningTrades + totals.losingTrades;
  const winRate = closedTrades > 0 ? totals.winningTrades / closedTrades : 0;

  const heldSymbols = new Set(positions.map((p) => p.sym));
  const opportunities = market.filter((m) => !heldSymbols.has(m.sym)).slice(0, TOP_OPPORTUNITIES);

  return (
    <Col gap={theme.spacing.md}>
      <Row gap={theme.spacing.lg} style={{ flexWrap: "wrap" }}>
        <StatRow
          label="net P&L"
          value={formatMoney(ns, netPnL)}
          valueColor={pnlColor(netPnL, theme)}
        />
        <StatRow
          label="$/hr"
          value={formatMoney(ns, pnlPerHour)}
          valueColor={pnlColor(pnlPerHour, theme)}
        />
        <StatRow label="session" value={formatDuration(sessionMs)} />
        <StatRow
          label="portfolio"
          value={formatMoney(ns, portfolioValue)}
          valueColor={theme.colors.money}
        />
        <StatRow
          label="unrealized"
          value={formatMoney(ns, unrealized)}
          valueColor={pnlColor(unrealized, theme)}
        />
        <StatRow
          label="realized"
          value={formatMoney(ns, totals.realizedPnL)}
          valueColor={pnlColor(totals.realizedPnL, theme)}
        />
        <StatRow label="commissions" value={formatMoney(ns, totals.commissionsPaid)} />
        <StatRow
          label="W/L"
          value={`${totals.winningTrades}/${totals.losingTrades}${
            closedTrades > 0 ? ` (${ns.format.percent(winRate, 0)})` : ""
          }`}
          valueColor={closedTrades > 0 ? pnlColor(winRate - 0.5, theme) : theme.colors.primary}
        />
        <StatRow label="positions" value={`${positions.length}`} />
      </Row>

      <PositionsTable ns={ns} positions={positions} theme={theme} />
      <OpportunitiesTable ns={ns} opportunities={opportunities} theme={theme} />
      <RecentActionsList
        ns={ns}
        actions={recentActions}
        lastTickAt={taskState.lastTickAt}
        theme={theme}
      />
    </Col>
  );
};

function pnlColor(value: number, theme: Theme): string {
  if (value > 0) return theme.colors.success;
  if (value < 0) return theme.colors.error;
  return theme.colors.primary;
}

function forecastColor(forecast: number, theme: Theme): string {
  if (forecast > STOCK_TRADER_CONFIG.ENTER_LONG) return theme.colors.success;
  if (forecast <= STOCK_TRADER_CONFIG.EXIT_LONG) return theme.colors.error;
  return theme.colors.warning;
}

interface PositionsTableProps {
  ns: NS;
  positions: PositionView[];
  theme: Theme;
}

function PositionsTable({ ns, positions, theme }: PositionsTableProps) {
  if (positions.length === 0) {
    return <span style={{ color: theme.colors.secondary }}>No open positions.</span>;
  }

  return (
    <Col gap={theme.spacing.xs}>
      <span style={{ color: theme.colors.secondary, fontSize: "0.85em" }}>holdings</span>
      <TableHeader
        columns={["sym", "shares", "avg", "bid", "P&L", "P&L %", "fcst", "vol"]}
        theme={theme}
      />
      {positions.map((p) => {
        const pnl = (p.bidPrice - p.avgPrice) * p.shares;
        const pnlPct = p.avgPrice > 0 ? (p.bidPrice - p.avgPrice) / p.avgPrice : 0;
        return (
          <TableRow
            key={p.sym}
            theme={theme}
            cells={[
              { value: p.sym, color: theme.colors.info },
              { value: ns.format.number(p.shares, 0) },
              { value: `$${ns.format.number(p.avgPrice, 2)}` },
              { value: `$${ns.format.number(p.bidPrice, 2)}` },
              { value: formatMoney(ns, pnl), color: pnlColor(pnl, theme) },
              { value: ns.format.percent(pnlPct, 2), color: pnlColor(pnl, theme) },
              { value: ns.format.number(p.forecast, 3), color: forecastColor(p.forecast, theme) },
              { value: ns.format.percent(p.volatility, 2) },
            ]}
          />
        );
      })}
    </Col>
  );
}

interface OpportunitiesTableProps {
  ns: NS;
  opportunities: MarketView[];
  theme: Theme;
}

function OpportunitiesTable({ ns, opportunities, theme }: OpportunitiesTableProps) {
  if (opportunities.length === 0) return null;

  return (
    <Col gap={theme.spacing.xs}>
      <span style={{ color: theme.colors.secondary, fontSize: "0.85em" }}>top opportunities</span>
      <TableHeader columns={["sym", "fcst", "vol", "edge/tick", "ask", "max sh"]} theme={theme} />
      {opportunities.map((m) => (
        <TableRow
          key={m.sym}
          theme={theme}
          cells={[
            { value: m.sym, color: theme.colors.primary },
            { value: ns.format.number(m.forecast, 3), color: forecastColor(m.forecast, theme) },
            { value: ns.format.percent(m.volatility, 2) },
            { value: ns.format.percent(m.profitPotential, 3), color: theme.colors.info },
            { value: `$${ns.format.number(m.askPrice, 2)}` },
            { value: ns.format.number(m.maxShares, 0) },
          ]}
        />
      ))}
    </Col>
  );
}

interface RecentActionsListProps {
  ns: NS;
  actions: TradeAction[];
  lastTickAt: number;
  theme: Theme;
}

function RecentActionsList({ ns, actions, lastTickAt, theme }: RecentActionsListProps) {
  if (actions.length === 0) {
    return (
      <span style={{ color: theme.colors.secondary, fontSize: "0.85em" }}>
        No trades yet (last tick {ageLabel(lastTickAt)}).
      </span>
    );
  }
  const slice = actions.slice(0, RECENT_ACTIONS_SHOWN);
  return (
    <Col gap={theme.spacing.xs}>
      <span style={{ color: theme.colors.secondary, fontSize: "0.85em" }}>recent trades</span>
      {slice.map((a, i) => (
        <Row key={i} gap={theme.spacing.sm} style={{ fontSize: "0.85em" }}>
          <span style={{ color: theme.colors.secondary, minWidth: 56 }}>{ageLabel(a.ts)}</span>
          <span style={{ color: a.kind === "buy" ? theme.colors.warning : theme.colors.info, minWidth: 32 }}>
            {a.kind.toUpperCase()}
          </span>
          <span style={{ color: theme.colors.primary, minWidth: 40 }}>{a.sym}</span>
          <span style={{ color: theme.colors.secondary }}>
            {ns.format.number(a.shares, 0)} @ ${ns.format.number(a.price, 2)}
          </span>
          {a.kind === "sell" && (
            <span style={{ color: pnlColor(a.pnl, theme) }}>{formatMoney(ns, a.pnl)}</span>
          )}
        </Row>
      ))}
    </Col>
  );
}

interface TableHeaderProps {
  columns: string[];
  theme: Theme;
}

function TableHeader({ columns, theme }: TableHeaderProps) {
  return (
    <Row gap={theme.spacing.sm} style={{ fontSize: "0.8em" }}>
      {columns.map((c, i) => (
        <span
          key={c}
          style={{
            color: theme.colors.secondary,
            flex: 1,
            textAlign: i === 0 ? "left" : "right",
          }}
        >
          {c}
        </span>
      ))}
    </Row>
  );
}

interface TableRowProps {
  cells: { value: string; color?: string }[];
  theme: Theme;
}

function TableRow({ cells, theme }: TableRowProps) {
  return (
    <Row gap={theme.spacing.sm} style={{ fontSize: "0.85em" }}>
      {cells.map((c, i) => (
        <span
          key={i}
          style={{
            color: c.color ?? theme.colors.primary,
            flex: 1,
            textAlign: i === 0 ? "left" : "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {c.value}
        </span>
      ))}
    </Row>
  );
}

function ageLabel(ts: number): string {
  if (!ts) return "—";
  const ms = Date.now() - ts;
  if (ms < 1000) return "now";
  return `${formatDuration(ms)} ago`;
}
