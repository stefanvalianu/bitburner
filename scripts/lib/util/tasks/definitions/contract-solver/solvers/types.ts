import { CodingContractSignatures } from "@ns";

export type ContractType = keyof CodingContractSignatures;

export type ContractData<T extends ContractType> = CodingContractSignatures[T][0];

export type ContractAnswer<T extends ContractType> = CodingContractSignatures[T][1];

export type Solver<T extends ContractType> = (data: ContractData<T>) => ContractAnswer<T>;

export type SolverMap = {
  [T in ContractType]: Solver<T>;
};

export type UntypedSolver = (data: unknown) => unknown;
