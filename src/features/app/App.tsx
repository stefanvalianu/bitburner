import { NS } from "@ns"
import { NsProvider } from "@repo/features/ns/NsProvider";
import { ThemeProvider } from "@repo/features/theme/ThemeProvider";
import { Dashboard } from "./Dashboard";
import { DashboardProvider } from "./DashboardProvider";
import { PreferencesProvider } from "@repo/features/preferences/PreferencesProvider";

type Props = {
  ns: NS;
}

export function App({ ns }: Props) {
  return (
    <NsProvider ns={ns}>
      <ThemeProvider>
        <DashboardProvider>
          <PreferencesProvider>
            <Dashboard />
          </PreferencesProvider>
        </DashboardProvider>
      </ThemeProvider>
    </NsProvider>
  );
}
