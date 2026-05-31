import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

const DIGITS = "0123456789";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LETTERS = LOWERCASE + UPPERCASE;
const ALPHANUMERIC = DIGITS + LETTERS;

type MastermindFeedback = {
  exact: number;
  misplaced: number;
};

type AttemptResult =
  | { kind: "success"; password: string }
  | { kind: "feedback"; feedback: MastermindFeedback }
  | { kind: "transient" }
  | { kind: "unknown" };

type FeedbackRead =
  | { kind: "feedback"; feedback: MastermindFeedback }
  | { kind: "transient" }
  | { kind: "unknown" };

type CountDiscovery =
  | { kind: "success"; password: string }
  | { kind: "counts"; counts: Map<string, number> }
  | { kind: "transient" }
  | { kind: "failed" };

type ExactCountResult =
  | { kind: "count"; count: number }
  | { kind: "success"; password: string }
  | { kind: "transient" }
  | { kind: "failed" };

type LocateResult =
  | { kind: "positions"; positions: number[] }
  | { kind: "success"; password: string }
  | { kind: "transient" }
  | { kind: "failed" };

type SentinelSolveResult =
  | CodebreakerResult
  | { result: "unavailable" };

type PositionConstraint = {
  guess: string;
  exact: number;
};

export class DeepGreenCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) {
    super(target, ns);
  }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const length = this.info.targetPasswordLength;
    const alphabet = this.alphabetForPasswordFormat(this.info.targetPasswordFormat);

    if (!Number.isInteger(length) || length <= 0 || alphabet.length === 0) {
      return { result: "failed" };
    }

    const discovered = await this.discoverCounts(length, alphabet);

    if (discovered.kind === "success") {
      return { result: "ok", password: discovered.password };
    }

    if (discovered.kind === "transient") {
      return { result: "transient" };
    }

    if (discovered.kind === "failed") {
      return { result: "failed" };
    }

    const counts = discovered.counts;
    const sentinelResult = await this.trySolveWithSentinel(length, alphabet, counts);

    if (sentinelResult.result !== "unavailable") {
      return sentinelResult;
    }

    const isNumeric = this.info.targetPasswordFormat === "numeric";
    const constraints: PositionConstraint[] = [];

    const candidateLimit = 4_096;

    for (let round = 0; round < Math.max(512, length * 128); round++) {
      const sample = this.sampleCandidates(
        counts,
        length,
        constraints,
        candidateLimit + 1,
        isNumeric,
      );

      if (sample.length === 0) {
        return { result: "failed" };
      }

      const candidates = sample.length > candidateLimit ? sample.slice(0, candidateLimit) : sample;
      const password = candidates.length === 1 ? candidates[0] : this.chooseGuess(candidates);
      const attempted = await this.tryPasswordAndReadFeedback(password);

      if (attempted.kind === "transient") {
        return { result: "transient" };
      }

      if (attempted.kind === "success") {
        return { result: "ok", password: attempted.password };
      }

      if (attempted.kind !== "feedback") {
        return { result: "failed" };
      }

      if (attempted.feedback.exact === length) {
        // Auth failed, but feedback claims a perfect positional match.
        // That is inconsistent, so treat it as unsolvable/bad data.
        return { result: "failed" };
      }

      constraints.push({
        guess: password,
        exact: attempted.feedback.exact,
      });
    }

    return { result: "failed" };
  }

  private async discoverCounts(length: number, alphabet: string): Promise<CountDiscovery> {
    const counts = new Map<string, number>();
    let total = 0;

    for (const char of alphabet) {
      const password = char.repeat(length);
      const attempted = await this.tryPasswordAndReadFeedback(password);

      if (attempted.kind === "transient") {
        return { kind: "transient" };
      }

      if (attempted.kind === "success") {
        return { kind: "success", password: attempted.password };
      }

      if (attempted.kind !== "feedback") {
        return { kind: "failed" };
      }

      // For a guess like "aaaa", exact + misplaced is exactly the number of
      // "a" characters in the real password.
      const count = attempted.feedback.exact + attempted.feedback.misplaced;

      if (!Number.isInteger(count) || count < 0 || count > length) {
        return { kind: "failed" };
      }

      if (count > 0) {
        counts.set(char, count);
        total += count;
      }

      if (total === length) {
        return { kind: "counts", counts };
      }

      if (total > length) {
        return { kind: "failed" };
      }
    }

    return total === length
      ? { kind: "counts", counts }
      : { kind: "failed" };
  }

  private async trySolveWithSentinel(
    length: number,
    alphabet: string,
    counts: Map<string, number>,
  ): Promise<SentinelSolveResult> {
    const sentinel = alphabet.split("").find(char => !counts.has(char));

    if (sentinel === undefined) {
      return { result: "unavailable" };
    }

    const known = Array.from({ length }, (): string | null => null);
    const chars = [...counts.keys()];

    for (let charIndex = 0; charIndex < chars.length; charIndex++) {
      const char = chars[charIndex];
      const unresolvedPositions = this.unresolvedPositions(known);
      const expectedCount = counts.get(char) ?? 0;

      if (charIndex === chars.length - 1) {
        if (expectedCount !== unresolvedPositions.length) {
          return { result: "failed" };
        }

        for (const position of unresolvedPositions) {
          known[position] = char;
        }

        break;
      }

      const count = await this.queryExactCount(char, unresolvedPositions, sentinel, length);

      if (count.kind === "transient") return { result: "transient" };
      if (count.kind === "failed") return { result: "failed" };
      if (count.kind === "success") return { result: "ok", password: count.password };
      if (count.count !== expectedCount) return { result: "failed" };
      if (count.count === 0) continue;

      const located = await this.locateExactPositions(char, unresolvedPositions, count.count, sentinel, length);

      if (located.kind === "transient") return { result: "transient" };
      if (located.kind === "failed") return { result: "failed" };
      if (located.kind === "success") return { result: "ok", password: located.password };

      for (const position of located.positions) {
        known[position] = char;
      }
    }

    if (known.some(char => char === null)) {
      return { result: "failed" };
    }

    const password = known.join("");
    const result = await this.authenticate(password);

    if (result === "transient") return { result: "transient" };
    if (result === "ok") return { result: "ok", password };

    return { result: "failed" };
  }

  private async locateExactPositions(
    char: string,
    positions: number[],
    count: number,
    sentinel: string,
    length: number,
  ): Promise<LocateResult> {
    if (count === 0) return { kind: "positions", positions: [] };
    if (count === positions.length) return { kind: "positions", positions };
    if (positions.length === 1) {
      return count === 1
        ? { kind: "positions", positions }
        : { kind: "failed" };
    }

    const splitIndex = Math.floor(positions.length / 2);
    const left = positions.slice(0, splitIndex);
    const right = positions.slice(splitIndex);
    const leftCount = await this.queryExactCount(char, left, sentinel, length);

    if (leftCount.kind !== "count") return leftCount;
    if (leftCount.count < 0 || leftCount.count > left.length || leftCount.count > count) {
      return { kind: "failed" };
    }

    const rightCount = count - leftCount.count;

    if (rightCount < 0 || rightCount > right.length) {
      return { kind: "failed" };
    }

    const leftMatches = await this.locateExactPositions(char, left, leftCount.count, sentinel, length);

    if (leftMatches.kind !== "positions") return leftMatches;

    const rightMatches = await this.locateExactPositions(char, right, rightCount, sentinel, length);

    if (rightMatches.kind !== "positions") return rightMatches;

    return {
      kind: "positions",
      positions: [...leftMatches.positions, ...rightMatches.positions],
    };
  }

  private async queryExactCount(
    char: string,
    positions: number[],
    sentinel: string,
    length: number,
  ): Promise<ExactCountResult> {
    const password = this.createSentinelProbe(char, positions, sentinel, length);
    const attempted = await this.tryPasswordAndReadFeedback(password);

    if (attempted.kind === "transient") return { kind: "transient" };
    if (attempted.kind === "success") return { kind: "success", password: attempted.password };
    if (attempted.kind !== "feedback") return { kind: "failed" };

    return { kind: "count", count: attempted.feedback.exact };
  }

  private createSentinelProbe(char: string, positions: number[], sentinel: string, length: number): string {
    const guess = Array.from({ length }, () => sentinel);

    for (const position of positions) {
      guess[position] = char;
    }

    return guess.join("");
  }

  private unresolvedPositions(known: Array<string | null>): number[] {
    const positions: number[] = [];

    for (let i = 0; i < known.length; i++) {
      if (known[i] === null) positions.push(i);
    }

    return positions;
  }

  private async tryPasswordAndReadFeedback(password: string): Promise<AttemptResult> {
    const result = await this.authenticate(password);

    if (result === "transient") {
      return { kind: "transient" };
    }

    if (result === "ok") {
      return { kind: "success", password };
    }

    const feedback = await this.readFeedbackForPassword(password);

    if (feedback.kind === "transient") {
      return { kind: "transient" };
    }

    if (feedback.kind === "feedback") {
      return { kind: "feedback", feedback: feedback.feedback };
    }

    return { kind: "unknown" };
  }

  private async readFeedbackForPassword(password: string): Promise<FeedbackRead> {
    // Normally the log is immediately available after authenticate() resolves.
    // The second pass only helps with occasional log-order/race weirdness.
    for (let round = 0; round < 2; round++) {
      const info = await this.getAuthenticateResultLog(password);

      if (info.result === "transient") {
        return { kind: "transient" };
      }

      if (info.result === "ok" && info.log) {
        const match = info.log.data.match(/^\s*(\d+)\s*,\s*(\d+)\s*$/u);

        if (match) {
          return {
            kind: "feedback",
            feedback: {
              exact: Number(match[1]),
              misplaced: Number(match[2]),
            },
          };
        }
      }

      if (round === 0) {
        await this.ns.sleep(25);
      }
    }

    return { kind: "unknown" };
  }

  private sampleCandidates(
    counts: Map<string, number>,
    length: number,
    constraints: PositionConstraint[],
    limit: number,
    isNumeric: boolean,
  ): string[] {
    const chars = [...counts.keys()].filter(char => (counts.get(char) ?? 0) > 0);
    const remaining = chars.map(char => counts.get(char) ?? 0);

    const current = Array.from({ length }, () => "");
    const exactSoFar = Array.from({ length: constraints.length }, () => 0);

    const result: string[] = [];
    const seen = new Set<string>();

    const visit = (index: number): void => {
      if (result.length >= limit) return;

      if (index === length) {
        for (let i = 0; i < constraints.length; i++) {
          if (exactSoFar[i] !== constraints[i].exact) return;
        }

        const password = current.join("");

        if (!seen.has(password)) {
          seen.add(password);
          result.push(password);
        }

        return;
      }

      const remainingPositionsAfterThis = length - index - 1;

      for (let charIndex = 0; charIndex < chars.length; charIndex++) {
        if (remaining[charIndex] <= 0) continue;

        const char = chars[charIndex];

        // Official numeric generation strips leading zeroes, so a multi-digit
        // numeric password cannot start with "0".
        if (isNumeric && length > 1 && index === 0 && char === "0") {
          continue;
        }

        let valid = true;
        const changedConstraintIndexes: number[] = [];

        for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex++) {
          const constraint = constraints[constraintIndex];

          if (constraint.guess[index] === char) {
            exactSoFar[constraintIndex]++;
            changedConstraintIndexes.push(constraintIndex);
          }

          const exact = exactSoFar[constraintIndex];

          if (
            exact > constraint.exact ||
            exact + remainingPositionsAfterThis < constraint.exact
          ) {
            valid = false;
            break;
          }
        }

        if (valid) {
          remaining[charIndex]--;
          current[index] = char;

          visit(index + 1);

          current[index] = "";
          remaining[charIndex]++;
        }

        for (const constraintIndex of changedConstraintIndexes) {
          exactSoFar[constraintIndex]--;
        }

        if (result.length >= limit) return;
      }
    };

    visit(0);
    return result;
  }

  private chooseGuess(candidates: string[]): string {
    if (candidates.length <= 2) {
      return candidates[0];
    }

    const guesses = this.evenSample(candidates, Math.min(64, candidates.length));
    const population = this.evenSample(candidates, Math.min(1_024, candidates.length));

    let bestGuess = guesses[0];
    let bestWorstBucket = Number.POSITIVE_INFINITY;

    for (const guess of guesses) {
      const buckets = Array.from({ length: guess.length + 1 }, () => 0);

      for (const candidate of population) {
        buckets[this.exactMatches(candidate, guess)]++;
      }

      let worstBucket = 0;

      for (const bucket of buckets) {
        if (bucket > worstBucket) worstBucket = bucket;
      }

      if (worstBucket < bestWorstBucket) {
        bestWorstBucket = worstBucket;
        bestGuess = guess;
      }
    }

    return bestGuess;
  }

  private evenSample<T>(items: T[], size: number): T[] {
    if (items.length <= size) {
      return items;
    }

    if (size <= 1) {
      return [items[0]];
    }

    const result: T[] = [];
    const lastIndex = items.length - 1;

    for (let i = 0; i < size; i++) {
      result.push(items[Math.floor((i * lastIndex) / (size - 1))]);
    }

    return result;
  }

  private exactMatches(a: string, b: string): number {
    let result = 0;

    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) result++;
    }

    return result;
  }

  private alphabetForPasswordFormat(format: string): string {
    switch (format) {
      case "numeric":
        return DIGITS;

      case "alphabetic":
        return LETTERS;

      case "alphanumeric":
        return ALPHANUMERIC;

      default:
        return ALPHANUMERIC;
    }
  }
}
