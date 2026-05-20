import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "../theme/ThemeProvider";

interface RowProps {
  children: ReactNode;
  gap?: number;
  align?: CSSProperties["alignItems"];
  style?: CSSProperties;
}

export function Row({ children, gap, align = "center", style }: RowProps) {
  const theme = useTheme();
  return (
    <div
      style={{
        fontFamily: theme.font.face,
        color: theme.colors.primary,
        display: "flex",
        flexDirection: "row",
        gap: gap ?? theme.spacing.md,
        alignItems: align,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
