import { NS } from "@ns";
import { BaseTask } from "@repo/common/tasks/baseTask";
import { BackdoorerState, backdoorerTask } from "../info";
import { crawlServersWithHierarchy, ServerInfo } from "@repo/common/crawlServers";

const POLL_MS = 10_0000;

class BackdoorerTask extends BaseTask<BackdoorerState> {
  constructor(ns: NS) {
    super(ns, backdoorerTask);
  }

  protected async run_task(): Promise<void> {
    if(!this.ns.getResetInfo().ownedSF.has(4)) {
      this.log.warn(`Cannot run Backdoorer with Singularity APIs.`);
      this.shutdown();
      return;
    }
    
    const allServers = crawlServersWithHierarchy(this.ns).filter(s => !s.server.purchasedByPlayer && s.server.requiredHackingSkill);
    let numBackdoored = allServers.filter(s => s.server.backdoorInstalled).length;

    this.updateState({
      numBackdoored: numBackdoored,
      total: allServers.length
    });

    while (numBackdoored < allServers.length) {
      if (!this.tick()) {
        return;
      }

      const skill = this.ns.getPlayer().skills.hacking;
      const backdoorable = allServers.filter(s => s.server.requiredHackingSkill! <= skill);

      // navigate to the target server and backdoor it
      for (const target of backdoorable) {
        const path = this.get_connection_path(target);
        for (const next of path) {
          this.ns.singularity.connect(next);
        }

        await this.ns.singularity.installBackdoor();

        if (this.ns.getServer(target.hostname).backdoorInstalled) {
          numBackdoored++;
          this.ns.tprint(`Backdoored ${target.hostname}`);
        } else {
          this.ns.tprint(`Failed to backdoor ${target.hostname}`);
        }

        if (!this.ns.singularity.connect("home")) {
          this.log.error(`Failed to connect home.`);
        }
      }
      
      this.updateState({
        numBackdoored: numBackdoored,
        total: allServers.length
      });

      await this.ns.asleep(POLL_MS);
    }

    this.ns.singularity.connect("home");
    this.log.info(`All servers backdoored.`);
  }

  private get_connection_path(target: ServerInfo): string[] {
    let chain: string[] = [target.hostname];
    let cur: ServerInfo  = target;

    while (cur.parent !== null) {
      chain.push(cur.parent.hostname);
      cur = cur.parent;
    }

    return chain.reverse();
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new BackdoorerTask(ns).start();
}
