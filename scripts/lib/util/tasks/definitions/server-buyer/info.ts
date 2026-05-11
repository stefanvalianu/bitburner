import { SERVER_PURCHASE_COMMUNICATION_PORT } from "../../../ports";
import { TaskDefinition, TaskState } from "../../types";

export const SERVER_BUYER_TASK_ID = "server-buyer";

// avoid extending ServerInfo to lower port object size
export interface CloudServerInfo {
  hostname: string;

  // the cost to upgrade this server to the maximum ram stage. -1 = invalid
  maxUpgradeCost: number;

  // the cost to upgrade the server's ram one time (x2). -1 = invalid
  nextUpgradeCost: number;
}

export interface ServerBuyerTaskState extends TaskState {
  // current cloud servers
  cloudServers: CloudServerInfo[];

  // max possible cloud servers
  maxCloudServers: number;
}

export type PurchasePreference = "auto" | "upgrade" | "new";

// The user can ask to make a purchase request at any time.
export interface ServerPurchaseRequest {
  // Whether the user wants to only do upgrades or new purchases
  preference: PurchasePreference;

  // Will iteratively purchase, choosing the most optimal
  // cost/GB up to a specific budget (if provided)
  budget?: number;
}

export const serverBuyerTask: TaskDefinition = {
  id: SERVER_BUYER_TASK_ID,
  description: "Used to purchase and upgrade personal servers.",
  category: "general",
  icon: "💰",
  autostart: true,
  communicationPort: SERVER_PURCHASE_COMMUNICATION_PORT,
  demand: {
    priority: "critical",
  },
};
