import { NS } from "@ns";

export interface Theme {
  colors: {
    backgroundprimary: string;
    backgroundsecondary: string;
    black: string;
    bnlvl0: string;
    bnlvl1: string;
    bnlvl2: string;
    bnlvl3: string;
    button: string;
    cha: string;
    // use code in place of hac (latter has ram cost)
    code: string;
    combat: string;
    disabled: string;
    error: string;
    errordark: string;
    errorlight: string;
    hp: string;
    info: string;
    infodark: string;
    infolight: string;
    int: string;
    maplocation: string;
    money: string;
    primary: string;
    primarydark: string;
    primarylight: string;
    rep: string;
    secondary: string;
    secondarydark: string;
    secondarylight: string;
    success: string;
    successdark: string;
    successlight: string;
    warning: string;
    warningdark: string;
    warninglight: string;
    well: string;
    welllight: string;
    white: string;
  },
  font: {
    face: string;
  },
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
  }
}

export function createTheme(ns: NS): Theme {
  const theme = ns.ui.getTheme();
  const styles =ns.ui.getStyles();

  return {
    colors: {
      backgroundprimary: theme.backgroundprimary,
      backgroundsecondary: theme.backgroundsecondary,
      black: theme.black,
      bnlvl0: theme.bnlvl0,
      bnlvl1: theme. bnlvl1,
      bnlvl2: theme.bnlvl2,
      bnlvl3: theme.bnlvl3,
      button: theme.button,
      cha: theme.cha,
      code: "#adff2f",
      combat: theme.combat,
      disabled: theme.disabled,
      error: theme.error,
      errordark: theme.errordark,
      errorlight: theme.errorlight,
      hp: theme.hp,
      info: theme.info,
      infodark: theme.infodark,
      infolight: theme.infolight,
      int: theme.int,
      maplocation: theme.maplocation,
      money: theme.money,
      primary: theme.primary,
      primarydark: theme.primarydark,
      primarylight: theme.primarylight,
      rep: theme.rep,
      secondary: theme.secondary,
      secondarydark: theme.secondarydark,
      secondarylight: theme.secondarylight,
      success: theme.success,
      successdark: theme.successdark,
      successlight: theme.successlight,
      warning: theme.warning,
      warningdark: theme.warningdark,
      warninglight: theme.warninglight,
      well: theme.well,
      welllight: theme.welllight,
      white: theme.white,
    },
    font: {
      face: styles.fontFamily,
    },
    spacing: {
      xs: 2,
      sm: 4,
      md: 8,
      lg: 16
    }
  };
}
