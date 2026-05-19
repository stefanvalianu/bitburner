import { useTheme } from "./theme";

// Animated dashed-arc spinner. Stroke uses the accent color when active,
// muted when idle — so the same component reads as "working" or "at rest"
// without the caller picking colors. Optional label sits beside the arc
// and scales with `size` so the pair stays visually balanced.
export function Spinner({
  active,
  size = 14,
  label,
}: {
  active: boolean;
  size?: number;
  label?: string;
}) {
  const { colors, fonts, space } = useTheme();
  const stroke = active ? colors.accent : colors.muted;
  const svg = (
    <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-hidden>
      <circle
        cx={8}
        cy={8}
        r={6}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray="20 12"
        strokeLinecap="round"
      >
        {active && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 8 8"
            to="360 8 8"
            dur="1s"
            repeatCount="indefinite"
          />
        )}
      </circle>
    </svg>
  );
  if (label === undefined) return svg;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space.xs,
        fontFamily: fonts.mono,
        fontSize: size,
        lineHeight: 1,
        color: stroke,
      }}
    >
      {svg}
      {label}
    </span>
  );
}
