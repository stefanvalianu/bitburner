import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "./theme";

interface RowProps {
  children: ReactNode;
  gap?: number;
  align?: CSSProperties["alignItems"];
  style?: CSSProperties;
}

export function Row({ children, gap, align = "center", style }: RowProps) {
  const { colors, fonts, space } = useTheme();
  return (
    <div
      style={{
        fontFamily: fonts.mono,
        color: colors.fg,
        display: "flex",
        flexDirection: "row",
        gap: gap ?? space.md,
        alignItems: align,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
