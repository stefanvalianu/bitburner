import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "./theme";

interface ColProps {
  children: ReactNode;
  gap?: number;
  align?: CSSProperties["alignItems"];
  style?: CSSProperties;
}

export function Col({ children, gap, align, style }: ColProps) {
  const { colors, fonts, space } = useTheme();
  return (
    <div
      style={{
        fontFamily: fonts.mono,
        color: colors.fg,
        display: "flex",
        flexDirection: "column",
        gap: gap ?? space.sm,
        alignItems: align,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
