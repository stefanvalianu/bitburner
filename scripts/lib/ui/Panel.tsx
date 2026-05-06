import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "./theme";

interface PanelProps {
  title?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

export function Panel({ title, children, style }: PanelProps) {
  const { colors, fonts, space } = useTheme();
  return (
    <div
      style={{
        fontFamily: fonts.mono,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
        padding: space.md,
        background: colors.surface,
        display: "flex",
        flexDirection: "column",
        gap: space.sm,
        minWidth: 280,
        ...style,
      }}
    >
      {title !== undefined && (
        <div style={{ fontWeight: "bold", color: colors.fg, paddingBottom: space.xs, borderBottom: `1px solid ${colors.fgDim}` }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
