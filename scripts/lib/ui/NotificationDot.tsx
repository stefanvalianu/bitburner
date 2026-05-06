import { space } from "./tokens";

interface NotificationDotProps {
  color: string;
  size?: number;
}

export function NotificationDot({ color, size = 8 }: NotificationDotProps) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 4px ${color}`,
        marginRight: space.sm,
        verticalAlign: "middle",
      }}
    />
  );
}
