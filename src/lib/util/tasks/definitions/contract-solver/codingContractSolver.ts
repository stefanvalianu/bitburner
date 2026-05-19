import { CodingContractObject, NS } from "@ns";
import { Logger } from "../../../logging/log";
import { solvers } from "./solvers";
import { ContractType, UntypedSolver } from "./solvers/types";

export class CodingContractSolver {
  constructor(
    private readonly ns: NS,
    private readonly log: Logger,
  ) {}

  solve(contract: CodingContractObject): string | undefined {
    try {
      const answerFunction = this.getSolutionFunction(contract.type);
      const answer = answerFunction(contract.data);

      const submit = contract.submit as (answer: unknown) => string;
      const reward = submit(answer);

      if (reward === "") return undefined;
      return reward;
    } catch (error) {
      this.report(
        `Failed to solve coding contract "${contract.type}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return undefined;
    }
  }

  private getSolutionFunction(type: ContractType): UntypedSolver {
    return solvers[type] as UntypedSolver;
  }

  private report(message: string): void {
    const logger = this.log as unknown as {
      error?: (message: string) => void;
      warn?: (message: string) => void;
      info?: (message: string) => void;
    };

    if (logger.error !== undefined) {
      logger.error(message);
      return;
    }

    if (logger.warn !== undefined) {
      logger.warn(message);
      return;
    }

    if (logger.info !== undefined) {
      logger.info(message);
      return;
    }

    this.ns.tprint(message);
  }
}
