import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "@repo/features/theme/ThemeProvider";

interface ColProps {
  children: ReactNode;
  gap?: number;
  align?: CSSProperties["alignItems"];
  style?: CSSProperties;
}

export function Col({ children, gap, align, style }: ColProps) {
  const theme = useTheme();

  return (
    <div
      style={{
        fontFamily: theme.font.face,
        color: theme.colors.primary,
        display: "flex",
        flexDirection: "column",
        gap: gap ?? theme.spacing.sm,
        alignItems: align,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
