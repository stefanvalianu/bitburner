import { NS } from "@ns"
import { NsProvider } from "../ns/NsProvider";
import { ThemeProvider } from "../theme/ThemeProvider";
import { DashboardControllerProvider } from "../../lib/util/useDashboardController";
import { PreferencesProvider } from "../../lib/util/usePreferences";
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
