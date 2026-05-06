import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { NS } from "@ns";
import { useNs } from "../ns";

// Theme tokens derived from the in-game theme (ns.ui.getTheme) and styles
// (ns.ui.getStyles). Components must consume these via useTheme() — never
// hard-code colors — so user theme changes flow through the whole UI.
export interface Theme {
  colors: {
    bg: string;
    surface: string;
    fg: string;
    fgDim: string;
    accent: string;
    warn: string;
    error: string;
    success: string;
    muted: string;
    border: string;
    well: string;
    wellLight: string;
    money: string;
    hack: string;
    hp: string;
    rep: string;
  };
  fonts: { mono: string };
  space: { xs: number; sm: number; md: number; lg: number };
}

export function buildTheme(ns: NS): Theme {
  const t = ns.ui.getTheme();
  const s = ns.ui.getStyles();
  return {
    colors: {
      bg: t.backgroundprimary,
      surface: t.backgroundsecondary,
      fg: t.primary,
      fgDim: t.primarydark,
      accent: t.info,
      warn: t.warning,
      error: t.error,
      success: t.success,
      muted: t.secondary,
      border: t.welllight,
      well: t.well,
      wellLight: t.welllight,
      money: t.money,
      hack: t.hack,
      hp: t.hp,
      rep: t.rep,
    },
    fonts: { mono: s.fontFamily },
    space: { xs: 2, sm: 4, md: 8, lg: 16 },
  };
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const ns = useNs();
  const theme = useMemo(() => buildTheme(ns), [ns]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside <ThemeProvider>");
  return theme;
}
