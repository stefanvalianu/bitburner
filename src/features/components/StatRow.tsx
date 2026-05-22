import { useTheme } from "@repo/features/theme/ThemeProvider";
import { Row } from "./Row";

interface StatRowProps {
  label: string;
  value: string;
  valueColor?: string;
}

// Label + value row with the label muted on the left and the value (tabular
// nums for clean column alignment) on the right. In a fixed-width parent the
// pair spreads with `space-between`; in a content-width parent (e.g. a Row of
// stats) they collapse adjacent with the configured gap.
export function StatRow({ label, value, valueColor }: StatRowProps) {
  const theme = useTheme();
  return (
    <Row gap={theme.spacing.sm} style={{ justifyContent: "space-between" }}>
      <span style={{ color: theme.colors.secondary }}>{label}</span>
      <span style={{ color: valueColor ?? theme.colors.primary, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </Row>
  );
}
