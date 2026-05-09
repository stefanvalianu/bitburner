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
      {state.propagatedVersion}
    </span>
  );
}
