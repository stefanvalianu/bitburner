import { MAIN_UX_REFRESH_INTERVAL } from "@repo/common/constants";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useRef } from "react";

// Bar geometry pinned in pixels on both halves so subpixel rendering can't
// give each row a slightly different height.
const BAR_HEIGHT = 2;

type Props = {
  value: number;
  color: string
}

export function ProgressBar({ value, color }: Props) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  // Suppress the transition when pct drops (level-up resets progress to ~0) so
  // the bar snaps instead of visibly draining backwards.
  const prevPct = useRef(pct);
  const animate = pct >= prevPct.current;
  prevPct.current = pct;
  return (
    <div
      style={{
        width: "100%",
        height: BAR_HEIGHT,
        background: theme.colors.well,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: BAR_HEIGHT,
          background: color,
          transition: animate
            ? `width ${MAIN_UX_REFRESH_INTERVAL}ms linear`
            : "none",
        }}
      />
    </div>
  );
}
