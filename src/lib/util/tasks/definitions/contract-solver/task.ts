import { NS } from "@ns";
import { CONTRACT_SOLVER_TASK_ID } from "./info";
import { BaseTask } from "../../baseTask";
import { CodingContractSolver } from "./codingContractSolver";

class ContractSolverTask extends BaseTask {
  private readonly contractSolver: CodingContractSolver;

  constructor(ns: NS) {
    super(ns, CONTRACT_SOLVER_TASK_ID);

    this.contractSolver = new CodingContractSolver(this.ns, this.log);
  }

  protected async run_task(): Promise<void> {
    while (true) {
      if (this.shouldShutdown) {
        return;
      }

      for (const server of this.snapshot.allServers) {
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

      // check every 10 secs (instead of 10 mins) so we can reasonably process a shutdown signal
      await this.ns.asleep(10_000);
    }
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new ContractSolverTask(ns).start();
}
