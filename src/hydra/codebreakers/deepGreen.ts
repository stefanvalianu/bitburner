import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

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

export class DeepGreenCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const length = this.target.passwordLength;
    const alphabet = this.alphabetForPasswordFormat(this.target.passwordFormat);

    if (length <= 0 || alphabet.length === 0) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const counts = new Map<string, number>();

    // Phase 1: discover the password's character multiset.
    // For "AAAA", exact + misplaced == count of "A" in the real password.
    for (const char of alphabet) {
      const password = char.repeat(length);
      const attempted = await this.tryPasswordAndReadFeedback(password);

      if (attempted.kind === "transient") return { result: "transient" };
      if (attempted.kind === "success") return { result: "ok", password: attempted.password };

      if (attempted.kind !== "feedback") {
        this.printCoreInfo();
        return { result: "impossible" };
      }

      const count = attempted.feedback.exact + attempted.feedback.misplaced;
      if (count > 0) counts.set(char, count);
    }

    const chars: string[] = [];
    for (const [char, count] of counts) {
      for (let i = 0; i < count; i++) chars.push(char);
    }

    if (chars.length !== length) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    // Phase 2: all remaining guesses are valid permutations of the known multiset.
    // Therefore misplaced is redundant: misplaced == length - exact for every candidate.
    let candidates = this.uniquePermutations(chars, this.target.passwordFormat);

    while (candidates.length > 0) {
      const password = this.chooseGuess(candidates);
      const attempted = await this.tryPasswordAndReadFeedback(password);

      if (attempted.kind === "transient") return { result: "transient" };
      if (attempted.kind === "success") return { result: "ok", password };

      if (attempted.kind !== "feedback") {
        this.printCoreInfo();
        return { result: "impossible" };
      }

      if (attempted.feedback.exact === length) {
        // Failed auth + perfect exact feedback is internally inconsistent.
        this.printCoreInfo();
        return { result: "impossible" };
      }

      candidates = candidates.filter(candidate =>
        this.exactMatches(candidate, password) === attempted.feedback.exact
      );
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private async tryPasswordAndReadFeedback(password: string): Promise<AttemptResult> {
    const result = await this.authenticate(password);

    if (result === null) {
      return { kind: "transient" };
    }

    if (result.success) {
      return { kind: "success", password };
    }

    const feedback = await this.readFeedbackForPassword(password);
    if (feedback === undefined) {
      return { kind: "unknown" };
    }

    return { kind: "feedback", feedback };
  }

  private async readFeedbackForPassword(password: string): Promise<MastermindFeedback | undefined> {
    const info = await this.ns.dnet.heartbleed(this.targetIp, {
      logsToCapture: 50,
      peek: true,
    });

    if (!info.success) {
      return undefined;
    }

    for (const log of info.logs) {
      const feedback = this.parseFeedbackLog(log, password);
      if (feedback !== undefined) {
        return feedback;
      }
    }

    return undefined;
  }

  private parseFeedbackLog(log: string, expectedPassword: string): MastermindFeedback | undefined {
    const parsed = this.tryParseJson(log);
    const candidates: unknown[] = [parsed];

    // Support both shapes:
    // 1. { data: "1,2", passwordAttempted: "..." }
    // 2. { message: "{\"data\":\"1,2\",\"passwordAttempted\":\"...\"}" }
    if (this.isRecord(parsed)) {
      const message = parsed.message;

      if (typeof message === "string") {
        candidates.push(this.tryParseJson(message));
      } else if (message !== undefined) {
        candidates.push(message);
      }
    }

    for (const candidate of candidates) {
      if (!this.isRecord(candidate)) continue;
      if (candidate.passwordAttempted !== expectedPassword) continue;
      if (typeof candidate.data !== "string") continue;

      const match = candidate.data.match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);
      if (!match) continue;

      return {
        exact: Number(match[1]),
        misplaced: Number(match[2]),
      };
    }

    return undefined;
  }

  private uniquePermutations(chars: string[], format: string): string[] {
    const counts = new Map<string, number>();
    for (const char of chars) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }

    const uniqueChars = [...counts.keys()];
    const current = Array.from({ length: chars.length }, () => "");
    const result: string[] = [];
    const isNumeric = format === "numeric";

    const visit = (index: number): void => {
      if (index === current.length) {
        result.push(current.join(""));
        return;
      }

      for (const char of uniqueChars) {
        const remaining = counts.get(char) ?? 0;
        if (remaining === 0) continue;

        // Official numeric password generation strips leading zeroes.
        if (isNumeric && current.length > 1 && index === 0 && char === "0") {
          continue;
        }

        counts.set(char, remaining - 1);
        current[index] = char;
        visit(index + 1);
        counts.set(char, remaining);
      }
    };

    visit(0);
    return result;
  }

  private chooseGuess(candidates: string[]): string {
    if (candidates.length <= 2) {
      return candidates[0];
    }

    const guesses = this.evenSample(candidates, Math.min(32, candidates.length));
    const population = this.evenSample(candidates, Math.min(5_000, candidates.length));

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

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
