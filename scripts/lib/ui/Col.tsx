import type { CSSProperties, ReactNode } from "react";
import { colors, fonts, space } from "./tokens";

interface ColProps {
  children: ReactNode;
  gap?: number;
  align?: CSSProperties["alignItems"];
  style?: CSSProperties;
}

export function Col({ children, gap = space.sm, align, style }: ColProps) {
  return (
    <div
      style={{
        fontFamily: fonts.mono,
        color: colors.fg,
        display: "flex",
        flexDirection: "column",
        gap,
        alignItems: align,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
