import type { ReactNode } from "react";
import { colors, fonts, space } from "./tokens";

interface BadgeProps {
  children: ReactNode;
  color?: string;
}

export function Badge({ children, color = colors.fg }: BadgeProps) {
  return (
    <span
      style={{
        fontFamily: fonts.mono,
        color,
        border: `1px solid ${color}`,
        padding: `0 ${space.sm}px`,
        fontSize: 11,
      }}
    >
      {children}
    </span>
  );
}
