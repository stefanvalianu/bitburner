import { ContractType, SolverMap, UntypedSolver } from "./types";

import {
  arrayJumpingGame,
  arrayJumpingGameII,
  mergeOverlappingIntervals,
  subarrayWithMaximumSum,
} from "./arrays";

import { lzCompression, lzDecompression, rleCompression } from "./compression";

import { caesarCipher, vigenereCipher } from "./encryption";

import { proper2ColoringOfGraph } from "./graph";

import {
  largestRectangleInMatrix,
  shortestPathInGrid,
  spiralizeMatrix,
  uniquePathsInGridI,
  uniquePathsInGridII,
} from "./grids";

import { hammingEncodedBinaryToInteger, hammingIntegerToEncodedBinary } from "./hamming";

import {
  findLargestPrimeFactor,
  minimumPathSumInTriangle,
  squareRoot,
  totalNumberOfPrimes,
  totalWaysToSum,
  totalWaysToSumII,
} from "./math";

import {
  algorithmicStockTraderI,
  algorithmicStockTraderII,
  algorithmicStockTraderIII,
  algorithmicStockTraderIV,
} from "./stocks";

import {
  findAllValidMathExpressions,
  generateIPAddresses,
  sanitizeParenthesesInExpression,
} from "./strings";
import { CodingContractObject, NS } from "@ns";

const solvers = {
  "Find Largest Prime Factor": findLargestPrimeFactor,
  "Subarray with Maximum Sum": subarrayWithMaximumSum,
  "Total Ways to Sum": totalWaysToSum,
  "Total Ways to Sum II": totalWaysToSumII,
  "Spiralize Matrix": spiralizeMatrix,
  "Array Jumping Game": arrayJumpingGame,
  "Array Jumping Game II": arrayJumpingGameII,
  "Merge Overlapping Intervals": mergeOverlappingIntervals,
  "Generate IP Addresses": generateIPAddresses,
  "Algorithmic Stock Trader I": algorithmicStockTraderI,
  "Algorithmic Stock Trader II": algorithmicStockTraderII,
  "Algorithmic Stock Trader III": algorithmicStockTraderIII,
  "Algorithmic Stock Trader IV": algorithmicStockTraderIV,
  "Minimum Path Sum in a Triangle": minimumPathSumInTriangle,
  "Unique Paths in a Grid I": uniquePathsInGridI,
  "Unique Paths in a Grid II": uniquePathsInGridII,
  "Shortest Path in a Grid": shortestPathInGrid,
  "Sanitize Parentheses in Expression": sanitizeParenthesesInExpression,
  "Find All Valid Math Expressions": findAllValidMathExpressions,
  "HammingCodes: Integer to Encoded Binary": hammingIntegerToEncodedBinary,
  "HammingCodes: Encoded Binary to Integer": hammingEncodedBinaryToInteger,
  "Proper 2-Coloring of a Graph": proper2ColoringOfGraph,
  "Compression I: RLE Compression": rleCompression,
  "Compression II: LZ Decompression": lzDecompression,
  "Compression III: LZ Compression": lzCompression,
  "Encryption I: Caesar Cipher": caesarCipher,
  "Encryption II: Vigenère Cipher": vigenereCipher,
  "Square Root": squareRoot,
  "Total Number of Primes": totalNumberOfPrimes,
  "Largest Rectangle in a Matrix": largestRectangleInMatrix,
} satisfies SolverMap;

const cyan = "\u001b[36m";
const red = "\u001b[31m";
const reset = "\u001b[0m";

export function solve(ns: NS, contract: CodingContractObject): void {
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
