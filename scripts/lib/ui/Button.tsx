import type { ReactNode } from "react";
import { useTheme } from "./theme";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "warn" | "error" | "primary";
  disabled?: boolean;
}

export function Button({ children, onClick, variant = "default", disabled = false }: ButtonProps) {
  const { colors, fonts, space } = useTheme();
  const active =
    variant === "warn"
      ? colors.warn
      : variant === "error"
        ? colors.error
        : variant === "primary"
          ? colors.accent
          : colors.fg;
  const c = disabled ? colors.muted : active;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: fonts.mono,
        background: disabled ? colors.well : colors.bg,
        color: c,
        border: `1px solid ${c}`,
        padding: `${space.xs}px ${space.md}px`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: space.sm,
      }}
    >
      {children}
    </button>
  );
}
