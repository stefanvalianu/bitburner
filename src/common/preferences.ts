export interface UserPreferences {
  /* 
    Money to keep on hand when considering spending options. All tasks
    which spend money should check this value and not spend below this amount.
  */
  reservedMoney: number;

  // Whether to auto-purchase servers using the server task.
  autobuyServers: boolean;

  // Whether to auto-purchase hacknet servers and their upgrades.
  autobuyHacknet: boolean;

  /*
    Number (1-100) representing the minimum win% required
    to enable gang clashes as part of warfare ticks.
    Undefined = use task default
  */
  gangClashWinThreshold?: number | undefined;

  /*
    Fraction (0.0-1.0) of `moneyMax` to preserve on hacking targets between
    batches — i.e. each HWGW batch is sized to steal at most
    `(1 - hackMinimumMoneyPct)` of max money. Higher values steal less per
    batch but tolerate more player-level drift before the cascade drains.
    Undefined = use the ultrahacker default (HACK_MINIMUM_MONEY_PCT in
    threadCalculations.ts). Stored as fraction, not percentage, to match
    the underlying constant.
  */
  hackMinimumMoneyPct?: number | undefined;

  // If true, stops auto-changing sleeve actions
  pauseSleeveActions: boolean;

  // whether to enable auto-purchasing of sleeve augmentations
  purchaseSleeveAugmentations: boolean;

  // Next bitNode to jump to after destroying the world demon. Defaults to 12 (infinite)
  nextBitNode?: number | undefined;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  reservedMoney: 0,
  autobuyServers: false,
  autobuyHacknet: false,
  gangClashWinThreshold: undefined,
  hackMinimumMoneyPct: undefined,
  pauseSleeveActions: false,
  purchaseSleeveAugmentations: true,
};
