import type { ReactNode } from "react";
import { useTheme } from "@repo/features/theme/ThemeProvider";

interface BadgeProps {
  children: ReactNode;
  color?: string;
}

export function Badge({ children, color }: BadgeProps) {
  const theme = useTheme();
  const c = color ?? theme.colors.primary;
  return (
    <span
      style={{
        fontFamily: theme.font.face,
        color: c,
        border: `1px solid ${c}`,
        padding: `0 ${theme.spacing.sm}px`,
        fontSize: 11,
      }}
    >
      {children}
    </span>
  );
}
