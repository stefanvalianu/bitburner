import { useEffect, useMemo, useRef, useState } from "react";
import { HackIcon, LockIcon, MoneyBagIcon } from "@repo/features/components/Icons";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";
import { useDashboard } from "../app/DashboardProvider";
import { NS } from "@ns";
import { ServerInfo, crawlServersWithHierarchy } from "@repo/common/crawlServers";

const INDENT_PX = 18;
const ROW_HEIGHT = "1.6em";
const FONT_SIZE = 14;
const SECURITY_NEAR_MIN_RATIO = 1.05;
const MONEY_NEAR_MAX_RATIO = 0.95;

type RailKind = "none" | "full" | "elbow" | "tee";

function RailColumn({ kind }: { kind: RailKind }) {
  const theme = useTheme();
  if (kind === "none") {
    return (
      <span
        style={{
          display: "inline-block",
          width: INDENT_PX,
          height: ROW_HEIGHT,
          flexShrink: 0,
        }}
      />
    );
  }
  // Vertical span goes top→bottom for "full"/"tee"; for "elbow" (└) it stops
  // at the midpoint where the horizontal arm tees off toward the hostname.
  const verticalBottom = kind === "elbow" ? "50%" : 0;
  const showHorizontal = kind === "elbow" || kind === "tee";
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: INDENT_PX,
        height: ROW_HEIGHT,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: verticalBottom,
          borderLeft: `1px solid ${theme.colors.primarydark}`,
        }}
      />
      {showHorizontal && (
        <span
          style={{
            position: "absolute",
            left: "50%",
            right: 0,
            top: "50%",
            borderTop: `1px solid ${theme.colors.primarydark}`,
          }}
        />
      )}
    </span>
  );
}

// Renders the label in the same font/weight/color we use for the matching
// hostname state, so the legend reads like a sample of an actual row.
function LegendHostname({
  color,
  bold = false,
  label,
}: {
  color: string;
  bold?: boolean;
  label: string;
}) {
  return <span style={{ color, fontWeight: bold ? 600 : 400 }}>{label}</span>;
}

interface TopBarProps {
  query: string;
  onQueryChange: (v: string) => void;
  matchCount: number;
  hasQuery: boolean;
}

function TopBar({ query, onQueryChange, matchCount, hasQuery }: TopBarProps) {
  const theme = useTheme();
  const noMatches = hasQuery && matchCount === 0;
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        gap: theme.spacing.md,
        padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
        background: theme.colors.backgroundsecondary,
        borderBottom: `1px solid ${theme.colors.primarydark}`,
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: theme.spacing.lg,
          flex: 1,
          minWidth: 0,
        }}
      >
        <LegendHostname color={theme.colors.primary} label="nuked" />
        <LegendHostname color={theme.colors.secondary} label="not nuked" />
        <LegendHostname color={theme.colors.info} bold label="player-owned" />
      </div>
      <input
        type="text"
        value={query}
        placeholder="filter hosts"
        spellCheck={false}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query !== "") {
            e.preventDefault();
            // Stop the native event so the enclosing Modal's body listener
            // doesn't also see Escape and close the dialog.
            e.nativeEvent.stopPropagation();
            onQueryChange("");
          }
        }}
        style={{
          flexShrink: 0,
          width: 180,
          background: theme.colors.backgroundprimary,
          color: noMatches ? theme.colors.error : theme.colors.primary,
          border: `1px solid ${noMatches ? theme.colors.error : theme.colors.welllight}`,
          fontFamily: theme.font.face,
          fontSize: 12,
          padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
          outline: "none",
        }}
      />
      {hasQuery && (
        <span
          style={{
            color: noMatches ? theme.colors.error : theme.colors.secondary,
            minWidth: 48,
            textAlign: "right",
            userSelect: "none",
          }}
        >
          {matchCount} match{matchCount === 1 ? "" : "es"}
        </span>
      )}
    </div>
  );
}

type Props = {
  isOpen: boolean;
}

export function ServerMapDialog({ isOpen }: Props) {
  const theme = useTheme();
  const ns = useNs();

  const { state } = useDashboard();

  const hackingLevel = state.player.skills.hacking;

  // Alternating row backgrounds. Use the two background tokens as solid
  // fills — both are darker than the panel surface (well/welllight), giving
  // a recessed-table feel against the elevated panel.
  const rowBackgrounds: [string, string] = [theme.colors.backgroundprimary, theme.colors.backgroundsecondary];

  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasQuery = normalizedQuery !== "";

  const { matchCount, firstMatchHost } = useMemo(() => {
    if (!hasQuery) return { matchCount: 0, firstMatchHost: null as string | null };
    let count = 0;
    let first: string | null = null;
    for (const s of state.servers) {
      if (s.hostname.toLowerCase().includes(normalizedQuery)) {
        if (first === null) first = s.hostname;
        count++;
      }
    }
    return { matchCount: count, firstMatchHost: first };
  }, [hasQuery, normalizedQuery, state.servers]);

  // When the available servers change, re-compute ServerInfo
  const serverInfo = useMemo<ServerInfo[]>(() => {
    return crawlServersWithHierarchy(ns, "home");
  }, [state.servers.length]);

  if (!isOpen) return null;

  return (
    <div style={{ fontFamily: theme.font.face, fontSize: FONT_SIZE }}>
      <TopBar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        matchCount={matchCount}
        hasQuery={hasQuery}
      />
      <div style={{ overflow: "auto", maxHeight: "65vh" }}>
        {serverInfo.map((s, idx) => (
          <ServerRow
            key={s.hostname}
            server={s}
            background={rowBackgrounds[idx % 2]}
            hackingLevel={hackingLevel}
            query={normalizedQuery}
            isFirstMatch={s.hostname === firstMatchHost}
            ns={ns}
          />
        ))}
      </div>
    </div>
  );
}

function HighlightedHostname({
  hostname,
  query,
  color,
  bold,
}: {
  hostname: string;
  query: string;
  color: string;
  bold: boolean;
}) {
  const theme = useTheme();
  const baseStyle = { color, fontWeight: bold ? 600 : 400 };
  if (query === "") return <span style={baseStyle}>{hostname}</span>;
  const idx = hostname.toLowerCase().indexOf(query);
  if (idx < 0) return <span style={baseStyle}>{hostname}</span>;
  const before = hostname.slice(0, idx);
  const match = hostname.slice(idx, idx + query.length);
  const after = hostname.slice(idx + query.length);
  return (
    <span style={baseStyle}>
      {before}
      <span style={{ background: theme.colors.primary, color: theme.colors.backgroundprimary, borderRadius: 2 }}>{match}</span>
      {after}
    </span>
  );
}

interface ServerRowProps {
  server: ServerInfo;
  background: string;
  hackingLevel: number;
  query: string;
  isFirstMatch: boolean;
  ns: NS
}

function ServerRow({
  server: s,
  background,
  hackingLevel,
  query,
  isFirstMatch,
  ns
}: ServerRowProps) {
  const theme = useTheme();
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFirstMatch && query !== "") {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isFirstMatch, query]);

  const server = ns.getServer(s.hostname);

  const purchased = server.purchasedByPlayer;
  const nuked = server.hasAdminRights;
  const required = server.requiredHackingSkill || 0;
  const portsRequired = server.numOpenPortsRequired || 0;
  const portsOpen = server.openPortCount || 0;
  const levelTooLow = hackingLevel < required;
  const portsMissing = portsOpen < portsRequired;

  const hostnameColor = purchased ? theme.colors.info : nuked ? theme.colors.primary : theme.colors.secondary;

  const hackTooltip = (() => {
    const parts: string[] = [];
    if (levelTooLow) parts.push(`Skill needed: ${required} (you: ${hackingLevel})`);
    if (portsMissing) parts.push(`Port openers: ${portsOpen}/${portsRequired}`);
    return parts.length > 0 ? parts.join("\n") : "Ready to hacky";
  })();

  // Security and money are only meaningful for hackable targets. Player-owned
  // boxes have moneyMax=0 and minDifficulty=1 with no scaling, so we hide the
  // icons there to avoid implying actionable state.
  const minDiff = server.minDifficulty ?? 0;
  const curDiff = server.hackDifficulty ?? 0;
  const securityAtMin = curDiff <= minDiff * SECURITY_NEAR_MIN_RATIO;
  const showSecurity = minDiff > 0 && !purchased && !securityAtMin;
  const securityTooltip = `Security: ${curDiff.toFixed(2)} (min ${minDiff.toFixed(2)})`;

  const moneyMax = server.moneyMax ?? 0;
  const moneyAvail = server.moneyAvailable ?? 0;
  const moneyFrac = moneyMax > 0 ? moneyAvail / moneyMax : 0;
  const moneyNearMax = moneyFrac >= MONEY_NEAR_MAX_RATIO;
  const showMoney = moneyMax > 0 && !purchased && !moneyNearMax;
  const moneyPct = (moneyFrac * 100).toFixed(0);
  const moneyTooltip = `Money: ${ns.format.number(moneyAvail, 2)} / ${ns.format.number(moneyMax, 2)} (${moneyPct}%)`;

  return (
    <div
      ref={rowRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: theme.spacing.sm,
        padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
        background,
        whiteSpace: "nowrap",
      }}
    >
      {Array.from({ length: s.depth }).map((_, i) => {
        let kind: RailKind;
        if (i < s.depth - 1) {
          kind = s.rails[i] ? "full" : "none";
        } else {
          kind = s.isLastSibling ? "elbow" : "tee";
        }
        return <RailColumn key={i} kind={kind} />;
      })}
      <HighlightedHostname
        hostname={s.hostname}
        query={query}
        color={hostnameColor}
        bold={purchased}
      />
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: theme.spacing.sm,
          marginLeft: theme.spacing.sm,
        }}
      >
        {!nuked && <HackIcon color={theme.colors.warning} title={hackTooltip} />}
        {showSecurity && <LockIcon color={theme.colors.secondary} title={securityTooltip} />}
        {showMoney && <MoneyBagIcon color={theme.colors.secondary} title={moneyTooltip} />}
      </span>
    </div>
  );
}
