import type { ReactNode } from "react";
import { useTheme } from "./theme";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "warn" | "error";
}

export function Button({ children, onClick, variant = "default" }: ButtonProps) {
  const { colors, fonts, space } = useTheme();
  const c = variant === "warn" ? colors.warn : variant === "error" ? colors.error : colors.fg;
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: fonts.mono,
        background: colors.bg,
        color: c,
        border: `1px solid ${c}`,
        padding: `${space.xs}px ${space.md}px`,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
