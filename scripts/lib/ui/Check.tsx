import { useTheme } from "./theme";

interface CheckProps {
  ok: boolean;
  size?: number;
}

export function Check({ ok, size = 14 }: CheckProps) {
  const { colors } = useTheme();
  const color = ok ? colors.success : colors.muted;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ verticalAlign: "middle" }}
      aria-hidden
    >
      {ok ? <path d="M3 8.5 L6.5 12 L13 4" /> : <path d="M4 8 L12 8" />}
    </svg>
  );
}
