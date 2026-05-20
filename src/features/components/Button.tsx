import type { ReactNode } from "react";
import { useTheme } from "../theme/ThemeProvider";

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "warn" | "error" | "primary";
  disabled?: boolean;
}

export function Button({ children, onClick, variant = "default", disabled = false }: ButtonProps) {
  const theme = useTheme();
  const active =
    variant === "warn"
      ? theme.colors.warning
      : variant === "error"
        ? theme.colors.error
        : variant === "primary"
          ? theme.colors.info
          : theme.colors.primary;
  const c = disabled ? theme.colors.secondary : active;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: theme.font.face,
        background: disabled ? theme.colors.well : theme.colors.backgroundprimary,
        color: c,
        border: `1px solid ${c}`,
        padding: `${theme.spacing.xs}px ${theme.spacing.md}px`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: theme.spacing.sm,
      }}
    >
      {children}
    </button>
  );
}
