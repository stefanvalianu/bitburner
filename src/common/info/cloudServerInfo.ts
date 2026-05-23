// avoid extending ServerInfo to lower port object size
export interface CloudServerInfo {
  hostname: string;

  // the cost to upgrade this server to the maximum ram stage. -1 = invalid
  maxUpgradeCost: number;

  // the cost to upgrade the server's ram one time (x2). -1 = invalid
  nextUpgradeCost: number;
}

export interface CloudServerState {
  // current cloud servers
  cloudServers: CloudServerInfo[];

  // max possible cloud servers
  maxCloudServers: number;
}

export type PurchasePreference = "auto" | "upgrade" | "new";

// The user can ask to make a purchase request at any time.
export interface CloudServerPurchaseRequest {
  // Whether the user wants to only do upgrades or new purchases
  preference: PurchasePreference;

  // Will iteratively purchase, choosing the most optimal
  // cost/GB up to a specific budget (if provided)
  budget?: number;
}
