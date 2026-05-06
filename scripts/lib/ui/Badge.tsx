import type { ReactNode } from "react";
import { useTheme } from "./theme";

interface BadgeProps {
  children: ReactNode;
  color?: string;
}

export function Badge({ children, color }: BadgeProps) {
  const { colors, fonts, space } = useTheme();
  const c = color ?? colors.fg;
  return (
    <span
      style={{
        fontFamily: fonts.mono,
        color: c,
        border: `1px solid ${c}`,
        padding: `0 ${space.sm}px`,
        fontSize: 11,
      }}
    >
      {children}
    </span>
  );
}
