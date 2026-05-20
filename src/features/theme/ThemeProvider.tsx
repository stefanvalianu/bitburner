import { ReactNode, useMemo, useContext, createContext } from "react";
import { useNs } from "../ns/NsProvider";
import { createTheme, Theme } from "./theme";

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  console.log('[TODO-REMOVE themeProvider rendered]');
  const ns = useNs();
  const theme = useMemo(() => createTheme(ns), [ns]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside <ThemeProvider>");
  return theme;
}
