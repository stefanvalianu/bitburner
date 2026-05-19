import type { ReactNode } from "react";
import { Row } from "./Row";
import { useTheme } from "./theme";

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

export function Stat({ label, value, color }: StatProps) {
  const { colors, space } = useTheme();
  return (
    <Row gap={space.sm}>
      <span style={{ color: colors.muted }}>{label}:</span>
      <span style={{ color: color ?? colors.fg }}>{value}</span>
    </Row>
  );
}
