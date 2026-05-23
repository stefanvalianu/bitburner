import { NS, Server } from "@ns";
import { crawlServers } from "@repo/common/crawlServers";
import { CloudServerInfo, CloudServerPurchaseRequest, CloudServerState } from "@repo/common/info/cloudServerInfo";
import { CLOUD_SERVER_REQUEST_PORT, CLOUD_SERVER_STATE_PORT, drainPortData, getPortData, USER_PREFERENCES_PORT } from "@repo/common/ports";
import { UserPreferences } from "@repo/common/preferences";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

// all cloud servers will be named `${CLOUD-SERVER-PREFIX}-#`
export const CLOUD_SERVER_PREFIX = "cloud";

/*
  This script is responsible for:
  - Purchasing cloud servers, whether automatically or from a user request
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));
  
  const userPreferences = getPortData<UserPreferences>(ns, USER_PREFERENCES_PORT);
  const shouldAutobuy = userPreferences?.autobuyServers || false;
  const purchaseRequests = drainPortData<CloudServerPurchaseRequest>(ns, CLOUD_SERVER_REQUEST_PORT);

  if ((ns.getServerMoneyAvailable("home") - (userPreferences?.reservedMoney || 0)) <= 0 || (!shouldAutobuy && (purchaseRequests === undefined || purchaseRequests.length === 0))) {
    // no money, or nothing to do
    return;
  }

  const allServers = crawlServers(ns).filter(s => s.purchasedByPlayer);

  // only publish on the port if there were changes
  let dirty = false;

  const cloudServerNames = ns.cloud.getServerNames();

  if (purchaseRequests && purchaseRequests.length > 0) {
    for (const request of purchaseRequests) {
      let spendingMoney = (ns.getServerMoneyAvailable("home") - (userPreferences?.reservedMoney || 0));
      let budget = request.budget ? Math.max(request.budget, spendingMoney) : spendingMoney;

      if (request.preference === "new") {
        if (0 !== tryPurchase(ns, false, budget)) dirty = true;
      } else if (request.preference === "upgrade") {
        if (0 !== tryUpgrade(ns, false, budget, cloudServerNames, allServers)) dirty = true;
      } else {
        if (0 !== autoBuySomething(ns, budget, allServers)) dirty = true;
      }
    }
  }

  if (shouldAutobuy) {
    let budget = (ns.getServerMoneyAvailable("home") - (userPreferences?.reservedMoney || 0));

    while (budget > 0) {
      const cost = autoBuySomething(ns, budget, allServers);

      // couldn't buy anything
      if (cost === 0) {
        break;
      } else {
        dirty = true;
      }
    }
  }

  if (dirty) {
    ns.writePort(CLOUD_SERVER_STATE_PORT, {
      cloudServers: getCloudServers(ns),
      maxCloudServers: ns.cloud.getServerLimit(),
    } satisfies CloudServerState);
  }
}

// avoid trying to be tricky and just get the latest
function getCloudServers(ns: NS): CloudServerInfo[] {
  const maxRam = ns.cloud.getRamLimit();
  
  return ns.cloud.getServerNames().map(
    (host) =>
      ({
        hostname: host,
        maxUpgradeCost: ns.cloud.getServerUpgradeCost(host, maxRam),
        nextUpgradeCost: ns.cloud.getServerUpgradeCost(
          host,
          2 * ns.getServerMaxRam(host),
        ),
      }) satisfies CloudServerInfo,
  );
}

// Returns the max ram that we can afford to upgrade a server given a budget and its cost
function getMaxAffordableUpgradeAmountRam(ns: NS, hostname: string, budget: number, allServers: Server[]): [number, number] {
  const currentRam = allServers.find((s) => s.hostname === hostname)?.maxRam ?? 0;
  if (currentRam === 0) return [0, 0];

  let targetRam = currentRam;
  let upgradeCost = 0;

  while (true) {
    const nextUpgradeCost = ns.cloud.getServerUpgradeCost(hostname, targetRam * 2);

    if (nextUpgradeCost !== -1 && nextUpgradeCost <= budget) {
      targetRam = targetRam * 2;
      upgradeCost = nextUpgradeCost;
    } else {
      // more like broke amirite
      break;
    }
  }

  return upgradeCost === 0 ? [0, 0] : [targetRam, upgradeCost];
}

// Returns the max ram server size we can purchase, and its cost
function getMaxPurchaseableServerSize(ns: NS, budget: number): [number, number] {
  let desiredRam = ns.cloud.getRamLimit();
  let purchaseCost = ns.cloud.getServerCost(desiredRam);

  // sorry but we're not buying servers with less than 8gb
  while (purchaseCost > budget && desiredRam > 8) {
    desiredRam = desiredRam / 2;
    purchaseCost = ns.cloud.getServerCost(desiredRam);
  }

  return desiredRam > 8 ? [desiredRam, purchaseCost] : [0, 0];
}

// Attempts to spend money on SOMETHING, returns the number spent (0 if nothing).
// Iteratively tries upgrading / purchasing until we run out of budget or can't do
// those things.
function autoBuySomething(ns: NS, budget: number, allServers: Server[]): number {
  let spent = 0;

  while (budget > 0) {
    let upgradeSpend = tryUpgrade(ns, true, budget, ns.cloud.getServerNames(), allServers);

    // always prefer upgrading
    if (upgradeSpend > 0) {
      budget -= upgradeSpend;
      spent += upgradeSpend;
      continue;
    }

    let purchaseSpent = tryPurchase(ns, true, budget);

    if (purchaseSpent > 0) {
      budget -= purchaseSpent;
      spent += purchaseSpent;
      continue;
    } else {
      // we couldn't upgrade and we couldn't purchase. we're done
      return spent;
    }
  }

  // ran out of budget
  return spent;
}

// Attempts to purchase servers. Exits after one purchase if `justOne` is set.
// Returns amount spent (0 if nothing). Will always attempt to purchase the
// largest size server possible, rather than purchasing many small servers.
function tryPurchase(ns: NS, justOne: boolean, budget: number): number {
  let spent = 0;
  let serverSuffix = getCloudServers(ns).length;

  const maxServers = ns.cloud.getServerLimit();

  while (budget > 0 && maxServers - getCloudServers(ns).length > 0) {
    const [maxRam, cost] = getMaxPurchaseableServerSize(ns, budget);

    if (maxRam > 0) {
      if (ns.cloud.purchaseServer(`${CLOUD_SERVER_PREFIX}-${serverSuffix}`, maxRam) !== "") {
        // we spent money
        spent += cost;
        budget -= cost;
        serverSuffix++;
        if (justOne) return spent;
      } else {
        ns.tprint(
          `Tried to purchase server with suffix ${serverSuffix} and ${maxRam} but failed?`,
        );
      }
    } else {
      // we couldn't purchase a server, no point looping
      return spent;
    }
  }

  return spent;
}

// Attempts to upgrade servers. Exits after one upgrade if `justOne` is set.
// Returns amount spent (0 if nothing). Will always attempt to upgrade one
// server at a time to its largest size.
function tryUpgrade(ns: NS, justOne: boolean, budget: number, targets: string[], allServers: Server[]): number {
  let unupgradeable = new Map<string, boolean>();
  let spent = 0;

  while (budget > 0 && unupgradeable.size < targets.length) {
    // keep trying to upgrade left-to-right until we run out of budget
    for (const target of targets) {
      const [maxUpgradeableRam, cost] = getMaxAffordableUpgradeAmountRam(ns, target, budget, allServers);

      if (maxUpgradeableRam > 0) {
        if (ns.cloud.upgradeServer(target, maxUpgradeableRam)) {
          // we spent money
          spent += cost;
          budget -= cost;
          if (justOne) return spent;
        } else {
          ns.tprint(`Tried to upgrade ${target} to ${maxUpgradeableRam} but failed?`);
        }
      } else {
        unupgradeable.set(target, true);
      }

      if (budget <= 0) {
        return spent;
      }
    }
  }

  return spent;
}
