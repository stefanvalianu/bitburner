import { useMemo, useRef, useState, type ReactNode } from "react";
import { CopyIcon, DoorIcon, HackIcon, HardwareIcon } from "../ui/Icons";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { getPlayerMonitorState } from "../util/tasks/definitions/player-monitor/info";
import { ServerInfo } from "../util/dashboardTypes";

const INDENT_PX = 18;
const ROW_HEIGHT = "1.6em";
const FONT_SIZE = 14;
const RAM_WARN_THRESHOLD = 0.8;

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

function LegendSwatch({ color, label }: { color: string; label: ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: space.xs }}>
      <span
        style={{
          display: "inline-block",
          width: 10,
          height: 10,
          background: color,
          border: `1px solid ${colors.fgDim}`,
        }}
      />
      <span style={{ color: colors.fgDim }}>{label}</span>
    </span>
  );
}

function Legend() {
  const { colors, space } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: space.lg,
        padding: `${space.sm}px ${space.md}px`,
        borderBottom: `1px solid ${colors.fgDim}`,
        fontSize: 12,
      }}
    >
      <LegendSwatch color={colors.fg} label="Nuked" />
      <LegendSwatch color={colors.muted} label="Not nuked" />
      <LegendSwatch color={colors.accent} label="Player-owned" />
      <LegendSwatch color={colors.error} label={`RAM ≥ ${RAM_WARN_THRESHOLD * 100}%`} />
    </div>
  );
}

export function ServerMapDialog() {
  const { colors, fonts } = useTheme();
  const { state } = useDashboardController();

  const playerState = getPlayerMonitorState(state);
  const hackingLevel = playerState?.stats?.hackingLevel || 0;

  const byHost = useMemo(
    () => new Map(state.allServers.map((s) => [s.hostname, s])),
    [state.allServers],
  );

  // Alternating row backgrounds. Use the two background tokens as solid
  // fills — both are darker than the panel surface (well/welllight), giving
  // a recessed-table feel against the elevated panel.
  const rowBackgrounds: [string, string] = [colors.bg, colors.surface];

  return (
    <div style={{ fontFamily: fonts.mono, fontSize: FONT_SIZE }}>
      <Legend />
      <div style={{ overflow: "auto", maxHeight: "65vh" }}>
        {state.allServers.map((s, idx) => (
          <ServerRow
            key={s.hostname}
            server={s}
            background={rowBackgrounds[idx % 2]}
            hackingLevel={hackingLevel}
            path={pathFromHome(s, byHost)}
          />
        ))}
      </div>
    </div>
  );
}

interface ServerRowProps {
  server: ServerInfo;
  background: string;
  hackingLevel: number;
  path: string;
}

function ServerRow({ server: s, background, hackingLevel, path }: ServerRowProps) {
  const { colors, space } = useTheme();

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

  return (
    <div
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
      <span style={{ color: hostnameColor, fontWeight: purchased ? 600 : 400 }}>{s.hostname}</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: space.sm,
          marginLeft: space.sm,
        }}
      >
        {s.backdoorInstalled && <DoorIcon color={colors.success} title="Backdoor installed" />}
        {!nuked && <HackIcon color={colors.warn} title={hackTooltip} />}
        <CopyPathButton text={path} color={colors.fgDim} />
        <HardwareIcon color={hardwareColor} title={hardwareTooltip} />
      </span>
    </div>
  );
}
