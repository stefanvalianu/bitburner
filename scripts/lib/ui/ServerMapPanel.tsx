import type { CSSProperties } from "react";
import type { GameState } from "../gameState";
import { Panel } from "./Panel";
import { useTheme } from "./theme";

const INDENT_PX = 16;
const ROW_HEIGHT = "1.6em";

type RailKind = "none" | "full" | "topHalf";

function RailColumn({ kind }: { kind: RailKind }) {
  const { colors } = useTheme();
  if (kind === "none") {
    return (
      <span
        style={{ display: "inline-block", width: INDENT_PX, height: ROW_HEIGHT, verticalAlign: "middle" }}
      />
    );
  }
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
          bottom: kind === "full" ? 0 : "50%",
          borderLeft: `1px solid ${colors.fgDim}`,
        }}
      />
    </span>
  );
}

export function ServerMapPanel({ state }: { state: GameState }) {
  const { colors, fonts, space } = useTheme();
  const { servers } = state;

  const cellPadding = `${space.xs}px ${space.sm}px`;
  const headerStyle: CSSProperties = {
    color: colors.fgDim,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "left",
    padding: cellPadding,
    borderBottom: `1px solid ${colors.fgDim}`,
  };

  // Alternating row backgrounds. Use the two background tokens as solid
  // fills — both are darker than the panel surface (well/welllight), giving
  // a recessed-table feel against the elevated panel.
  const rowBackgrounds: [string, string] = [colors.bg, colors.surface];

  return (
    <Panel title={`Server map · ${servers.length}`} collapsible defaultOpen={false}>
      <table
        style={{
          fontFamily: fonts.mono,
          borderCollapse: "collapse",
          width: "100%",
          fontSize: 12,
        }}
      >
        <thead>
          <tr>
            <th style={{ ...headerStyle, width: 56, textAlign: "right" }}>Depth</th>
            <th style={headerStyle}>Server</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s, idx) => {
            const background = rowBackgrounds[idx % 2];
            return (
              <tr key={s.hostname}>
                <td
                  style={{
                    padding: cellPadding,
                    color: colors.muted,
                    textAlign: "right",
                    background,
                  }}
                >
                  {s.depth}
                </td>
                <td
                  style={{
                    padding: `0 ${space.sm}px`,
                    color: colors.fg,
                    whiteSpace: "nowrap",
                    background,
                  }}
                >
                  {Array.from({ length: s.depth }).map((_, i) => {
                    let kind: RailKind;
                    if (i < s.depth - 1) {
                      kind = s.rails[i] ? "full" : "none";
                    } else {
                      kind = s.isLastSibling ? "topHalf" : "full";
                    }
                    return <RailColumn key={i} kind={kind} />;
                  })}
                  {s.hostname}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
