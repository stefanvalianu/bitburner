import { CodingContractObject, NS } from "@ns";
import { crawlServers } from "@repo/common/crawlServers";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";
import { solvers } from "@repo/tasks/actionator/core/contractSolvers";
import { ContractType, UntypedSolver } from "@repo/tasks/actionator/core/contractSolvers/types";

/*
  This script is responsible for:
  - Searching for and solving coding contracts
*/
const cyan = "\u001b[36m";
const red = "\u001b[31m";
const reset = "\u001b[0m";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  const servers = crawlServers(ns);
  for (const server of servers) {
    const contracts = ns.ls(server.hostname, ".cct");

    for (const cct of contracts) {
      const contract = ns.codingcontract.getContract(cct, server.hostname);
      solve(ns, contract);
    }
  }

  invokeNextScript(ns);
}

function solve(ns: NS, contract: CodingContractObject): void {
  try {
    const answerFunction = getSolutionFunction(contract.type);
    const answer = answerFunction(contract.data);

    const submit = contract.submit as (answer: unknown) => string;
    const reward = submit(answer);
    ns.tprint(`Solved ${contract.type} and ${cyan}${reward}${reset}`);
  } catch (error) {
    ns.tprint(`${red}Failed to solve coding contract "${contract.type}": ${error instanceof Error ? error.message : String(error)}${reset}`);
  }
}

function getSolutionFunction(type: ContractType): UntypedSolver {
  return solvers[type] as UntypedSolver;
}
