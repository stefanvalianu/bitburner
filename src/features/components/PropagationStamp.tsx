import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useDashboardController } from "@repo/features/useDashboardController";

export function PropagationStamp() {
  const theme = useTheme();
  const { state } = useDashboardController();

  if (!state.propagatedVersion) return null;

  return (
    <span
      style={{
        position: "fixed",
        bottom: 4,
        right: 6,
        fontSize: 10,
        color: theme.colors.secondary,
        pointerEvents: "none",
      }}
    >
      last updated{" "}
      {new Date(Number(state.propagatedVersion)).toLocaleString("en-US", {
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
      })}
    </span>
  );
}
