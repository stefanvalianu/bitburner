// --------------------------------------------------------------------------------
//  PreferencesContext owns player-tunable settings for the dashboard. UX panels
//  write to it; DashboardControllerProvider reads from it when publishing the
//  snapshot, so tasks can consume the latest preferences off the port.
//
//  State lives in React, but every setPreferences also persists to a JSON file
//  so values survive a dashboard restart. On mount we seed from that file.
// --------------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useNs } from "./ns";
import { DEFAULT_PREFERENCES, type DashboardPreferences } from "./dashboardTypes";

const PREFERENCES_FILE = ".state/preferences.json";

export interface PreferencesController {
  preferences: DashboardPreferences;
  setPreferences: (next: DashboardPreferences) => void;
  // Latest-value handle for consumers that read preferences inside a stable
  // setInterval/effect (DashboardControllerProvider) without rebuilding it
  // every time the user edits a value.
  preferencesRef: MutableRefObject<DashboardPreferences>;
}

const PreferencesContext = createContext<PreferencesController | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const ns = useNs();

  const [preferences, setPreferencesState] = useState<DashboardPreferences>(() => {
    const raw = ns.read(PREFERENCES_FILE);
    if (!raw) return DEFAULT_PREFERENCES;
    try {
      // Defaults under parsed so older files missing newer fields hydrate
      // with sensible values instead of `undefined`.
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });

  const preferencesRef = useRef<DashboardPreferences>(preferences);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  const setPreferences = useCallback(
    (next: DashboardPreferences) => {
      ns.write(PREFERENCES_FILE, JSON.stringify(next), "w");
      setPreferencesState(next);
    },
    [ns],
  );

  const value = useMemo(
    () => ({ preferences, setPreferences, preferencesRef }),
    [preferences, setPreferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesController {
  const v = useContext(PreferencesContext);
  if (!v) throw new Error("usePreferences must be used inside <PreferencesProvider>");
  return v;
}
