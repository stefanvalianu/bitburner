import { NS } from "@ns"
import { NsProvider } from "@repo/features/ns/NsProvider";
import { ThemeProvider } from "@repo/features/theme/ThemeProvider";
import { DashboardControllerProvider } from "@repo/features/useDashboardController";
import { PreferencesProvider } from "@repo/features/usePreferences";
import { Dashboard } from "./Dashboard";

type Props = {
  ns: NS;
}

export function App({ ns }: Props) {
  return (
    <NsProvider ns={ns}>
      <ThemeProvider>
        <PreferencesProvider>
          <DashboardControllerProvider>
            <Dashboard />
          </DashboardControllerProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </NsProvider>
  );
}
