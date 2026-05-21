import { usePreferences } from "@repo/features/preferences/PreferencesProvider";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";
import { useDashboard } from "@repo/features/app/DashboardProvider";

export function ServerPanel() {
  const theme = useTheme();
  const ns = useNs();
  const { preferences } = usePreferences();
  const { gameInfo } = useDashboard();
  
  return (
    <>
    </>
  );
}
