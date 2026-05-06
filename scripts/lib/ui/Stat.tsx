import type { ReactNode } from "react";
import { colors, space } from "./tokens";
import { Row } from "./Row";

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

export function Stat({ label, value, color = colors.fg }: StatProps) {
  return (
    <Row gap={space.sm}>
      <span style={{ color: colors.muted }}>{label}:</span>
      <span style={{ color }}>{value}</span>
    </Row>
  );
}
