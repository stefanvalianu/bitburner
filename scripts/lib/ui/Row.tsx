import type { CSSProperties, ReactNode } from "react";
import { colors, fonts, space } from "./tokens";

interface RowProps {
  children: ReactNode;
  gap?: number;
  align?: CSSProperties["alignItems"];
  style?: CSSProperties;
}

export function Row({ children, gap = space.md, align = "center", style }: RowProps) {
  return (
    <div
      style={{
        fontFamily: fonts.mono,
        color: colors.fg,
        display: "flex",
        flexDirection: "row",
        gap,
        alignItems: align,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
