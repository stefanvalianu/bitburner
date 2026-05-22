import { NS } from "@ns";
import { BaseTask } from "@repo/common/tasks/baseTask";
import { CodingContractSolver } from "./codingContractSolver";
import { contractSolverTask } from "@repo/tasks/contract-solver/info";
import { crawlServers } from "@repo/common/crawlServers";

// This slower interval causes us to take longer to shutdown when requested
const SEARCH_INTERVAL = 60_000;

class ContractSolverTask extends BaseTask {
  private readonly contractSolver: CodingContractSolver;

  constructor(ns: NS) {
    super(ns, contractSolverTask);

    this.contractSolver = new CodingContractSolver(this.ns, this.log);
  }

  protected async run_task(): Promise<void> {
    while (true) {
      if (!this.tick()) {
        return;
      }

      const servers = crawlServers(this.ns);
      for (const server of servers) {
        const contracts = this.ns.ls(server.hostname, ".cct");

        for (const cct of contracts) {
          const contract = this.ns.codingcontract.getContract(cct, server.hostname);
          const reward = this.contractSolver.solve(contract);

          if (reward) {
            this.log.info(
              `Solved contract of difficulty ${contract.difficulty} and received ${reward}.`,
            );
          }
        }
      }

      await this.ns.asleep(SEARCH_INTERVAL);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new ContractSolverTask(ns).start();
}
