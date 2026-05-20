import type { ReactNode } from "react";
import { Row } from "./Row";
import { useTheme } from "../theme/ThemeProvider";

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

export function Stat({ label, value, color }: StatProps) {
  const theme = useTheme();
  return (
    <Row gap={theme.spacing.sm}>
      <span style={{ color: theme.colors.secondary }}>{label}:</span>
      <span style={{ color: color ?? theme.colors.primary }}>{value}</span>
    </Row>
  );
}
