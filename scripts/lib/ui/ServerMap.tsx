import type { CSSProperties, ReactNode } from "react";
import { useGameState } from "../gameState";
import type { ServerInfo } from "../utils/serverMap";
import { Icon, PortsIcon } from "./Icons";
import { useTheme } from "./theme";

const INDENT_PX = 18;
const ROW_HEIGHT = "1.6em";
const FONT_SIZE = 14;

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
          verticalAlign: "middle",
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
        verticalAlign: "middle",
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

function PlayerIcon({ color }: { color: string }) {
  return (
    <Icon color={color} title="Player-owned server">
      <circle cx="8" cy="5" r="2.5" />
      <path d="M3 14 C3 11 5 9.5 8 9.5 C11 9.5 13 11 13 14" />
    </Icon>
  );
}

function HackReadyIcon({ color }: { color: string }) {
  return (
    <Icon color={color} title="Ready to hack — skill and ports satisfied">
      <path d="M9 2 L3 9 L7 9 L7 14 L13 7 L9 7 Z" />
    </Icon>
  );
}

function LevelIcon({ color }: { color: string }) {
  return (
    <Icon color={color} title="Your hacking level is below the server's required level">
      <rect x="5" y="7" width="6" height="6.5" rx="0.5" />
      <path d="M6.5 7 V5 A1.5 1.5 0 0 1 9.5 5 V7" />
    </Icon>
  );
}

function NukedIcon({ color }: { color: string }) {
  return (
    <Icon color={color} title="Nuked — admin rights, backdoor pending">
      <path d="M4 13.5 H12" />
      <path d="M5.5 13.5 V8 A2.5 2.5 0 0 1 10.5 8 V13.5" />
      <path d="M8 5.5 V2.5" />
      <circle cx="8" cy="5.5" r="1" fill={color} stroke="none" />
    </Icon>
  );
}

function BackdoorIcon({ color }: { color: string }) {
  return (
    <Icon color={color} title="Backdoor installed">
      <rect x="4" y="2.5" width="8" height="11" />
      <circle cx="10" cy="8" r="0.6" fill={color} stroke="none" />
    </Icon>
  );
}

function CoresIcon({ color }: { color: string }) {
  return (
    <Icon color={color} title="CPU cores">
      <rect x="4" y="4" width="8" height="8" />
      <rect x="6.5" y="6.5" width="3" height="3" />
      <path d="M6 4 V2 M10 4 V2 M6 14 V12 M10 14 V12 M4 6 H2 M4 10 H2 M14 6 H12 M14 10 H12" />
    </Icon>
  );
}

function RamIcon({ color }: { color: string }) {
  return (
    <Icon color={color} title="RAM (used / max, GB)">
      <rect x="2" y="5" width="12" height="6" />
      <path d="M5 5 V11 M8 5 V11 M11 5 V11" />
      <path d="M3.5 11 V13 M12.5 11 V13" />
    </Icon>
  );
}

function formatGb(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

interface CellProps {
  background: string;
  align?: "left" | "right" | "center";
  children: ReactNode;
}

function Cell({ background, align = "left", children }: CellProps) {
  const { space } = useTheme();
  return (
    <td
      style={{
        padding: `${space.xs}px ${space.sm}px`,
        whiteSpace: "nowrap",
        textAlign: align,
        background,
      }}
    >
      {children}
    </td>
  );
}

interface IconWithValueProps {
  icon: ReactNode;
  value: ReactNode;
}

function IconWithValue({ icon, value }: IconWithValueProps) {
  const { space } = useTheme();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: space.xs }}>
      {icon}
      {value}
    </span>
  );
}

function StateCell({ s, hackingLevel }: { s: ServerInfo; hackingLevel: number }) {
  const { colors, space } = useTheme();
  if (s.purchasedByPlayer) return <PlayerIcon color={colors.accent} />;
  if (s.backdoorInstalled) return <BackdoorIcon color={colors.success} />;
  if (s.hasAdminRights) return <NukedIcon color={colors.hack} />;
  const levelTooLow = hackingLevel < s.requiredHackingSkill;
  const portsMissing = s.openPortCount < s.numOpenPortsRequired;
  if (!levelTooLow && !portsMissing) return <HackReadyIcon color={colors.hack} />;
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: space.sm, color: colors.muted }}
    >
      {levelTooLow && (
        <IconWithValue icon={<LevelIcon color={colors.warn} />} value={s.requiredHackingSkill} />
      )}
      {portsMissing && (
        <IconWithValue
          icon={<PortsIcon color={colors.warn} title="Required ports not yet open" />}
          value={`${s.openPortCount}/${s.numOpenPortsRequired}`}
        />
      )}
    </span>
  );
}

// Reserved widths for each segment of the State column. Picked to fit the
// worst-case content (e.g. "[lock]9999 [ports]5/5" for state, "1.23/1024" for
// RAM) so rows align vertically regardless of which signals are present.
const STATE_WIDTH_PX = 140;
const CORES_WIDTH_PX = 36;
const RAM_WIDTH_PX = 110;

export function ServerMap() {
  const { colors, fonts, space } = useTheme();
  const { servers, stats } = useGameState();
  const { hackingLevel } = stats;

  const headerStyle: CSSProperties = {
    color: colors.fgDim,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "left",
    padding: `${space.xs}px ${space.sm}px`,
    borderBottom: `1px solid ${colors.fgDim}`,
  };

  // Alternating row backgrounds. Use the two background tokens as solid
  // fills — both are darker than the panel surface (well/welllight), giving
  // a recessed-table feel against the elevated panel.
  const rowBackgrounds: [string, string] = [colors.bg, colors.surface];

  return (
    <div style={{ overflow: "auto", maxHeight: "70vh" }}>
      <table
        style={{
          fontFamily: fonts.mono,
          borderCollapse: "collapse",
          width: "100%",
          fontSize: FONT_SIZE,
        }}
      >
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: "left", width: 1, whiteSpace: "nowrap" }}>
              State
            </th>
            <th style={{ ...headerStyle, width: "100%" }}>Server</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s, idx) => {
            const background = rowBackgrounds[idx % 2];
            const hostnameColor = s.purchasedByPlayer ? colors.accent : colors.fg;
            return (
              <tr key={s.hostname}>
                <Cell background={background} align="left">
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: space.md,
                      color: colors.fg,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        width: STATE_WIDTH_PX,
                      }}
                    >
                      <StateCell s={s} hackingLevel={hackingLevel} />
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        width: CORES_WIDTH_PX,
                      }}
                    >
                      <IconWithValue icon={<CoresIcon color={colors.fgDim} />} value={s.cpuCores} />
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        width: RAM_WIDTH_PX,
                      }}
                    >
                      <IconWithValue
                        icon={<RamIcon color={colors.fgDim} />}
                        value={`${formatGb(s.ramUsed)}/${formatGb(s.maxRam)}`}
                      />
                    </span>
                  </span>
                </Cell>
                <td
                  style={{
                    padding: `0 ${space.sm}px`,
                    whiteSpace: "nowrap",
                    background,
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
                  <span
                    style={{
                      color: hostnameColor,
                      fontWeight: s.purchasedByPlayer ? 600 : 400,
                    }}
                  >
                    {s.hostname}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
