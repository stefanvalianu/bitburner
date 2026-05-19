import { useDashboardController } from "../util/useDashboardController";
import { useTheme } from "./theme";

export function PropagationStamp() {
  const { colors } = useTheme();
  const { state } = useDashboardController();

  if (!state.propagatedVersion) return null;

  return (
    <span
      style={{
        position: "fixed",
        bottom: 4,
        right: 6,
        fontSize: 10,
        color: colors.muted,
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
