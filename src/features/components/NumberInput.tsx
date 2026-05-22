import type { CSSProperties } from "react";
import { useTheme } from "@repo/features/theme/ThemeProvider";

interface NumberInputProps {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  style?: CSSProperties;
}

// Themed `<input type="number">` for currency/quantity entry in modals. Value
// is a string so callers can keep the raw input (handles blank, "1e6", etc.)
// without coercing through Number on every keystroke.
export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  placeholder,
  style,
}: NumberInputProps) {
  const theme = useTheme();
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: theme.colors.backgroundsecondary,
        color: theme.colors.primary,
        border: `1px solid ${theme.colors.welllight}`,
        padding: theme.spacing.xs,
        fontFamily: theme.font.face,
        fontSize: "1em",
        minWidth: 220,
        ...style,
      }}
    />
  );
}
