import { NS } from "@ns";
import { CloudServerInfo, SERVER_BUYER_TASK_ID, ServerBuyerTaskState, ServerPurchaseRequest } from "./info";
import { BaseTask } from "../../baseTask";
import { drainPortData, SERVER_PURCHASE_COMMUNICATION_PORT } from "../../../ports";

// all cloud servers will be named `${CLOUD-SERVER-PREFIX}-#`
export const CLOUD_SERVER_PREFIX = "cloud";

class ServerBuyerTask extends BaseTask<ServerBuyerTaskState> {
  private readonly maxCloudServerRam: number;
  private readonly maxCloudServers: number;

  constructor(ns: NS) {
    super(ns, SERVER_BUYER_TASK_ID);

    this.maxCloudServerRam = this.ns.cloud.getRamLimit();
    this.maxCloudServers = this.ns.cloud.getServerLimit();
  }

  protected async run_task(): Promise<void> {
    // send this right away as we may not be dirty for a while
    this.patchState({ cloudServers: this.getCloudServers(), maxCloudServers: this.maxCloudServers });

    while (true) {
      if (this.shouldShutdown) {
        return;
      }

      // only publish on the port if there were changes
      let dirty = false;

      const cloudServerNames = this.ns.cloud.getServerNames();
      let money = this.getPlayerSpendingMoney();

      // check for user requests
      const userRequests = drainPortData<ServerPurchaseRequest>(this.ns, SERVER_PURCHASE_COMMUNICATION_PORT);
      if (userRequests && userRequests.length > 0) {
        for (const request of userRequests) {
          let spendingMoney = this.getPlayerSpendingMoney();
          let budget = request.budget ? Math.max(request.budget, spendingMoney) : spendingMoney;
          
          if (request.preference === "new") {
            if (0 !== this.tryPurchase(false, budget)) dirty = true;
          } else if (request.preference === "upgrade") {
            if (0 !== this.tryUpgrade(false, budget, cloudServerNames)) dirty = true;
          } else {
            if (0 !== this.autoBuySomething(budget)) dirty = true;
          }
        }
      }

      if (this.snapshot.preferences.autobuyServers) {
        let budget = this.getPlayerSpendingMoney();

        while (budget > 0) {
          const cost = this.autoBuySomething(budget);

          // couldn't buy anything
          if (cost === 0) {
            break;
          } else {
            dirty = true;
          }
        }
      }

      if (dirty) {
        this.patchState({ cloudServers: this.getCloudServers(), maxCloudServers: this.maxCloudServers });
      }
      await this.ns.asleep(10_000);
    }
  }

  // avoid trying to be tricky and just get the latest
  private getCloudServers(): CloudServerInfo[] {
    return this.ns.cloud.getServerNames().map((host) => ({
      hostname: host,
      maxUpgradeCost: this.ns.cloud.getServerUpgradeCost(host, this.maxCloudServerRam),
      nextUpgradeCost: this.ns.cloud.getServerUpgradeCost(host, 2 * this.ns.getServerMaxRam(host))
    } satisfies CloudServerInfo));
  }

  // we need to check player money live instead of relying on 
  // cached version to be safe and respect the purchase limits
  // obviously this is not perfect as the resource is not truly
  // locked, but we're not performing rocket surgery here.
  private getPlayerSpendingMoney(): number {
    return this.ns.getServerMoneyAvailable("home") - this.snapshot.preferences.reservedMoney;
  }

  // Returns the max ram that we can afford to upgrade a server given a budget and its cost
  private getMaxAffordableUpgradeAmountRam(hostname: string, budget: number): [number, number] {
    const currentRam = this.snapshot.allServers.find(s => s.hostname === hostname)?.maxRam ?? 0;
    if (currentRam === 0) return [0, 0];

    let targetRam = currentRam;
    let upgradeCost = 0;

    while (true) {
      const nextUpgradeCost = this.ns.cloud.getServerUpgradeCost(hostname, targetRam * 2);

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
  private getMaxPurchaseableServerSize(budget: number): [number, number] {
    let desiredRam = this.maxCloudServerRam;
    let purchaseCost = this.ns.cloud.getServerCost(desiredRam);

    // sorry but we're not buying servers with less than 8gb
    while (purchaseCost > budget && desiredRam > 8) {
      desiredRam = desiredRam / 2;
      purchaseCost = this.ns.cloud.getServerCost(desiredRam);
    }

    return desiredRam > 8 ? [desiredRam, purchaseCost] : [0, 0];
  }

  // Attempts to spend money on SOMETHING, returns the number spent (0 if nothing).
  // Iteratively tries upgrading / purchasing until we run out of budget or can't do
  // those things.
  private autoBuySomething(budget: number): number {
    let spent = 0;

    while (budget > 0) {
      let upgradeSpend = this.tryUpgrade(true, budget, this.ns.cloud.getServerNames());

      // always prefer upgrading
      if (upgradeSpend > 0) {
        budget -= upgradeSpend;
        spent += upgradeSpend;
        continue;
      } 

      let purchaseSpent = this.tryPurchase(true, budget);

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
  private tryPurchase(justOne: boolean, budget: number): number {
    let spent = 0;
    let serverSuffix = this.getCloudServers().length;

    while (budget > 0 && (this.maxCloudServers - this.getCloudServers().length) > 0) {
      const [maxRam, cost] = this.getMaxPurchaseableServerSize(budget);

      if (maxRam > 0) {
        if (this.ns.cloud.purchaseServer(`${CLOUD_SERVER_PREFIX}-${serverSuffix}`, maxRam) !== "") {
          // we spent money
          spent += cost;
          budget -= cost;
          serverSuffix++;
          if (justOne) return spent;
        } else {
          this.log.error(`Tried to purchase server with suffix ${serverSuffix} and ${maxRam} but failed?`);
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
  private tryUpgrade(justOne: boolean, budget: number, targets: string[]): number {
    let unupgradeable = new Map<string, boolean>();
    let spent = 0;

    while (budget > 0 && unupgradeable.size < targets.length) {
      // keep trying to upgrade left-to-right until we run out of budget
      for (const target of targets) {
        const [maxUpgradeableRam, cost] = this.getMaxAffordableUpgradeAmountRam(target, budget);

        if (maxUpgradeableRam > 0) {
          if (this.ns.cloud.upgradeServer(target, maxUpgradeableRam)) {
            // we spent money
            spent += cost;
            budget -= cost;
            if (justOne) return spent;
          } else {
            this.log.error(`Tried to upgrade ${target} to ${maxUpgradeableRam} but failed?`);
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
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new ServerBuyerTask(ns).start();
}
