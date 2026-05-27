import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

const DIGITS = "0123456789";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const ALPHANUMERIC = DIGITS + LOWERCASE;

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
    const isNumeric = this.info.targetPasswordFormat === "numeric";
    const constraints: PositionConstraint[] = [];

    // This should normally finish well below this. The cap prevents pathological loops.
    const maxRounds = Math.max(32, length * 8);

    for (let round = 0; round < maxRounds; round++) {
      const sample = this.sampleCandidates(
        counts,
        length,
        constraints,
        Math.max(128, Math.min(1_024, length * 96)),
        isNumeric,
      );

      if (sample.length === 0) {
        return { result: "failed" };
      }

      const password = this.chooseGuess(sample);
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

      for (const charIndex of this.shuffledIndices(chars.length)) {
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

  private shuffledIndices(length: number): number[] {
    const result = Array.from({ length }, (_, index) => index);

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = result[i];

      result[i] = result[j];
      result[j] = temp;
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
        return LOWERCASE;

      case "alphanumeric":
        return ALPHANUMERIC;

      default:
        return ALPHANUMERIC;
    }
  }
}
