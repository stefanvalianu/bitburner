import { NS } from "@ns";
import { CONTRACT_SOLVER_TASK_ID } from "./info";
import { BaseTask } from "../../baseTask";

class ChallengeSolverTask extends BaseTask {
  constructor(ns: NS) {
    super(ns, CONTRACT_SOLVER_TASK_ID);
  }

  protected async run_task(): Promise<void> {
    // todo fill this out, just using this for ram rn
    try {
      this.ns.codingcontract.getContract("something", "home");
      this.ns.codingcontract.attempt("answer", "file", "home");
    } catch(_) {}
  }
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  await new ChallengeSolverTask(ns).start();
}
