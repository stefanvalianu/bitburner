import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "./theme";

// Muted small-text helper for descriptions and inline hints. Override layout
// (padding, alignment) via `style`; color/font-size are theme-controlled.
export function Hint({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { colors } = useTheme();
  return <span style={{ color: colors.muted, fontSize: "0.85em", ...style }}>{children}</span>;
}
