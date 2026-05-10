import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CopyIcon, DoorIcon, HackIcon, HardwareIcon, LockIcon, MoneyBagIcon } from "../ui/Icons";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { getPlayerMonitorState } from "../util/tasks/definitions/player-monitor/info";
import { ServerInfo } from "../util/dashboardTypes";

const INDENT_PX = 18;
const ROW_HEIGHT = "1.6em";
const FONT_SIZE = 14;
const RAM_WARN_THRESHOLD = 0.8;
const SECURITY_NEAR_MIN_RATIO = 1.05;
const MONEY_NEAR_MAX_RATIO = 0.95;

type RailKind = "none" | "full" | "elbow" | "tee";

function RailColumn({ kind }: { kind: RailKind }) {
  const { colors } = useTheme();
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
          borderLeft: `1px solid ${colors.fgDim}`,
        }}
      />
      {showHorizontal && (
        <span
          style={{
            position: "absolute",
            left: "50%",
            right: 0,
            top: "50%",
            borderTop: `1px solid ${colors.fgDim}`,
          }}
        />
      )}
    </span>
  );
}

function formatGb(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function formatMoney(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}t`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}b`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}m`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}k`;
  return `$${n.toFixed(0)}`;
}

// Walk the parent chain back to the root and join with " | " — the format the
// game's terminal accepts as a connect-path mnemonic.
function pathFromHome(s: ServerInfo, byHost: Map<string, ServerInfo>): string {
  const path: string[] = [];
  let cur: ServerInfo | undefined = s;
  while (cur) {
    path.unshift(cur.hostname);
    cur = cur.parent ? byHost.get(cur.parent) : undefined;
  }
  return path.join(" | ");
}

function CopyPathButton({ text, color }: { text: string; color: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    // Reach navigator via ownerDocument.defaultView — naming `window` or
    // `document` directly trips Bitburner's static RAM analyzer.
    const view = ref.current?.ownerDocument?.defaultView;
    const clip = view?.navigator?.clipboard;
    if (!clip) return;
    void clip.writeText(text).then(() => {
      setCopied(true);
      view?.setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <span
      ref={ref}
      onClick={onClick}
      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}
    >
      <CopyIcon color={color} title={copied ? "Copied!" : `Copy path — ${text}`} />
    </span>
  );
}

function LegendIcon({ icon, label }: { icon: ReactNode; label: string }) {
  const { colors, space } = useTheme();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: space.xs }}>
      {icon}
      <span style={{ color: colors.fgDim }}>{label}</span>
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
  const { colors, fonts, space } = useTheme();
  const noMatches = hasQuery && matchCount === 0;
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        gap: space.md,
        padding: `${space.sm}px ${space.md}px`,
        background: colors.surface,
        borderBottom: `1px solid ${colors.fgDim}`,
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: space.lg,
          flex: 1,
          minWidth: 0,
        }}
      >
        <LegendHostname color={colors.fg} label="nuked" />
        <LegendHostname color={colors.muted} label="not nuked" />
        <LegendHostname color={colors.accent} bold label="player-owned" />
        <LegendIcon
          icon={<HardwareIcon color={colors.error} title="RAM warning" />}
          label={`ram ≥ ${RAM_WARN_THRESHOLD * 100}%`}
        />
        <LegendIcon
          icon={<LockIcon color={colors.success} title="Min security" />}
          label="min security"
        />
        <LegendIcon
          icon={<MoneyBagIcon color={colors.warn} title="Max money" />}
          label="max money"
        />
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
          background: colors.bg,
          color: noMatches ? colors.error : colors.fg,
          border: `1px solid ${noMatches ? colors.error : colors.border}`,
          fontFamily: fonts.mono,
          fontSize: 12,
          padding: `${space.xs}px ${space.sm}px`,
          outline: "none",
        }}
      />
      {hasQuery && (
        <span
          style={{
            color: noMatches ? colors.error : colors.muted,
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

export function ServerMapDialog() {
  const { colors, fonts } = useTheme();
  const { state } = useDashboardController();

  const playerState = getPlayerMonitorState(state);
  const hackingLevel = playerState?.player.skills.hacking || 0;

  const byHost = useMemo(
    () => new Map(state.allServers.map((s) => [s.hostname, s])),
    [state.allServers],
  );

  // Alternating row backgrounds. Use the two background tokens as solid
  // fills — both are darker than the panel surface (well/welllight), giving
  // a recessed-table feel against the elevated panel.
  const rowBackgrounds: [string, string] = [colors.bg, colors.surface];

  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasQuery = normalizedQuery !== "";

  const { matchCount, firstMatchHost } = useMemo(() => {
    if (!hasQuery) return { matchCount: 0, firstMatchHost: null as string | null };
    let count = 0;
    let first: string | null = null;
    for (const s of state.allServers) {
      if (s.hostname.toLowerCase().includes(normalizedQuery)) {
        if (first === null) first = s.hostname;
        count++;
      }
    }
    return { matchCount: count, firstMatchHost: first };
  }, [hasQuery, normalizedQuery, state.allServers]);

  return (
    <div style={{ fontFamily: fonts.mono, fontSize: FONT_SIZE }}>
      <TopBar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        matchCount={matchCount}
        hasQuery={hasQuery}
      />
      <div style={{ overflow: "auto", maxHeight: "65vh" }}>
        {state.allServers.map((s, idx) => (
          <ServerRow
            key={s.hostname}
            server={s}
            background={rowBackgrounds[idx % 2]}
            hackingLevel={hackingLevel}
            path={pathFromHome(s, byHost)}
            query={normalizedQuery}
            isFirstMatch={s.hostname === firstMatchHost}
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
  const { colors } = useTheme();
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
      <span style={{ background: colors.warn, color: colors.bg, borderRadius: 2 }}>{match}</span>
      {after}
    </span>
  );
}

interface ServerRowProps {
  server: ServerInfo;
  background: string;
  hackingLevel: number;
  path: string;
  query: string;
  isFirstMatch: boolean;
}

function ServerRow({
  server: s,
  background,
  hackingLevel,
  path,
  query,
  isFirstMatch,
}: ServerRowProps) {
  const { colors, space } = useTheme();
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFirstMatch && query !== "") {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isFirstMatch, query]);

  const purchased = s.purchasedByPlayer;
  const nuked = s.hasAdminRights;
  const required = s.requiredHackingSkill || 0;
  const portsRequired = s.numOpenPortsRequired || 0;
  const portsOpen = s.openPortCount || 0;
  const levelTooLow = hackingLevel < required;
  const portsMissing = portsOpen < portsRequired;

  const hostnameColor = purchased ? colors.accent : nuked ? colors.fg : colors.muted;

  const ramFrac = s.maxRam > 0 ? s.ramUsed / s.maxRam : 0;
  const ramHigh = ramFrac >= RAM_WARN_THRESHOLD;
  const hardwareColor = ramHigh ? colors.error : colors.fgDim;

  const hackTooltip = (() => {
    const parts: string[] = [];
    if (levelTooLow) parts.push(`Skill needed: ${required} (you: ${hackingLevel})`);
    if (portsMissing) parts.push(`Port openers: ${portsOpen}/${portsRequired}`);
    return parts.length > 0 ? parts.join("\n") : "Ready to hack";
  })();

  const ramPct = (ramFrac * 100).toFixed(0);
  const hardwareTooltip = `Cores: ${s.cpuCores}\nRAM: ${formatGb(s.ramUsed)}/${formatGb(s.maxRam)} GB (${ramPct}%)`;

  // Security and money are only meaningful for hackable targets. Player-owned
  // boxes have moneyMax=0 and minDifficulty=1 with no scaling, so we hide the
  // icons there to avoid implying actionable state.
  const minDiff = s.minDifficulty ?? 0;
  const curDiff = s.hackDifficulty ?? 0;
  const showSecurity = minDiff > 0 && !purchased;
  const securityAtMin = curDiff <= minDiff * SECURITY_NEAR_MIN_RATIO;
  const securityColor = securityAtMin ? colors.success : colors.fgDim;
  const securityTooltip = `Security: ${curDiff.toFixed(2)} (min ${minDiff.toFixed(2)})`;

  const moneyMax = s.moneyMax ?? 0;
  const moneyAvail = s.moneyAvailable ?? 0;
  const showMoney = moneyMax > 0 && !purchased;
  const moneyFrac = moneyMax > 0 ? moneyAvail / moneyMax : 0;
  const moneyNearMax = moneyFrac >= MONEY_NEAR_MAX_RATIO;
  const moneyColor = moneyNearMax ? colors.warn : colors.fgDim;
  const moneyPct = (moneyFrac * 100).toFixed(0);
  const moneyTooltip = `Money: ${formatMoney(moneyAvail)} / ${formatMoney(moneyMax)} (${moneyPct}%)`;

  return (
    <div
      ref={rowRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: space.sm,
        padding: `${space.xs}px ${space.sm}px`,
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
          gap: space.sm,
          marginLeft: space.sm,
        }}
      >
        <CopyPathButton text={path} color={colors.fgDim} />
        {s.backdoorInstalled && <DoorIcon color={colors.success} title="Backdoor installed" />}
        {!nuked && <HackIcon color={colors.warn} title={hackTooltip} />}
        <HardwareIcon color={hardwareColor} title={hardwareTooltip} />
        {showSecurity && <LockIcon color={securityColor} title={securityTooltip} />}
        {showMoney && <MoneyBagIcon color={moneyColor} title={moneyTooltip} />}
      </span>
    </div>
  );
}
