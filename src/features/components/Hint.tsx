import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "../theme/ThemeProvider";

// Muted small-text helper for descriptions and inline hints. Override layout
// (padding, alignment) via `style`; color/font-size are theme-controlled.
export function Hint({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const theme = useTheme();
  return <span style={{ color: theme.colors.secondary, fontSize: "0.85em", ...style }}>{children}</span>;
}
