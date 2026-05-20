import { SolverMap } from "./types";

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

export const solvers = {
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
