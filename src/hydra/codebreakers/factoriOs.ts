import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

const SMALL_PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29,
  31, 37, 41, 43, 47, 53, 59, 61, 67,
  71, 73, 79, 83, 89, 97,
];

const LARGE_PRIMES = [
  1069, 1409, 1471, 1567, 1597, 1601, 1697, 1747, 1801, 1889,
  1979, 1999, 2063, 2207, 2371, 2503, 2539, 2693, 2741, 2753,
  2801, 2819, 2837, 2909, 2939, 3169, 3389, 3571, 3761, 3881,
  4217, 4289, 4547, 4729, 4789, 4877, 4943, 4951, 4957, 5393,
  5417, 5419, 5441, 5519, 5527, 5647, 5779, 5881, 6007, 6089,
  6133, 6389, 6451, 6469, 6547, 6661, 6719, 6841, 7103, 7549,
  7559, 7573, 7691, 7753, 7867, 8053, 8081, 8221, 8329, 8599,
  8677, 8761, 8839, 8963, 9103, 9199, 9343, 9467, 9551, 9601,
  9739, 9749, 9859,
];

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export class FactoriOsCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat !== "numeric") {
      return { result: "impossible" };
    }

    const solver = new DivisiblePasswordSolver(
      this.info.targetPasswordLength,
      this.info.targetPasswordDifficulty,
    );

    for (let attempts = 0; attempts < 250; attempts++) {
      const passwordNum = solver.nextGuess();
      if (passwordNum === null) {
        break;
      }

      const password = passwordNum.toString();
      const result = await this.authenticate(password);

      if (result === null) return { result: "transient" };
      if (result.success) return { result: "ok", password };

      const feedback = await this.readFeedbackForPassword(password);
      if (feedback === undefined) {
        return { result: "transient" };
      }

      solver.giveFeedback(passwordNum, feedback);
    }

    return { result: "impossible" };
  }

  private async readFeedbackForPassword(password: string): Promise<boolean | undefined> {
    const info = await this.ns.dnet.heartbleed(this.info.targetIp, {
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

  private parseFeedbackLog(log: string, expectedPassword: string): boolean | undefined {
    const parsed = this.tryParseJson(log);
    const candidates: unknown[] = [parsed];

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
      if (candidate.data === "true") return true;
      if (candidate.data === "false") return false;
    }

    return undefined;
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

export class DivisiblePasswordSolver {
  private readonly primes: number[];
  private readonly maxGuess: bigint;

  private primeIndex = 0;
  private currentPower = 0n;
  private answer = 1n;

  private pendingGuess: number | null = null;
  private finalGuessReturned = false;

  constructor(length: number, difficulty = Number.POSITIVE_INFINITY) {
    const safeLength = Math.max(1, Math.floor(length));
    const maxByLength = 10n ** BigInt(safeLength) - 1n;

    this.maxGuess = maxByLength < MAX_SAFE_BIGINT ? maxByLength : MAX_SAFE_BIGINT;
    this.primes = difficulty > 12
      ? [...SMALL_PRIMES, ...LARGE_PRIMES]
      : SMALL_PRIMES;
  }

  public isSolved(): boolean {
    return this.primeIndex >= this.primes.length;
  }

  public getAnswer(): number | null {
    if (!this.isSolved()) return null;
    if (this.answer > MAX_SAFE_BIGINT) return null;
    return Number(this.answer);
  }

  public getRemainingCount(): number {
    return this.isSolved() ? 1 : -1;
  }

  public nextGuess(): number | null {
    if (this.pendingGuess !== null) {
      return this.pendingGuess;
    }

    while (this.primeIndex < this.primes.length) {
      const prime = BigInt(this.primes[this.primeIndex]);

      if (this.currentPower === 0n) {
        this.currentPower = prime;
      }

      if (this.currentPower > this.maxGuess || this.currentPower > MAX_SAFE_BIGINT) {
        this.moveToNextPrime();
        continue;
      }

      const guess = Number(this.currentPower);
      this.pendingGuess = guess;
      return guess;
    }

    if (this.finalGuessReturned) {
      return null;
    }

    this.finalGuessReturned = true;

    if (this.answer < 1n || this.answer > this.maxGuess || this.answer > MAX_SAFE_BIGINT) {
      return null;
    }

    this.pendingGuess = Number(this.answer);
    return this.pendingGuess;
  }

  public giveFeedback(guess: number, isDivisibleByGuess: boolean): void {
    if (this.pendingGuess !== null && guess !== this.pendingGuess) {
      throw new Error(
        `Expected feedback for guess ${this.pendingGuess}, but got ${guess}`,
      );
    }

    this.pendingGuess = null;

    if (this.primeIndex >= this.primes.length) {
      return;
    }

    const prime = BigInt(this.primes[this.primeIndex]);
    const guessedPower = BigInt(guess);

    if (isDivisibleByGuess) {
      this.answer *= prime;

      const nextPower = guessedPower * prime;
      if (nextPower > this.maxGuess || nextPower > MAX_SAFE_BIGINT) {
        this.moveToNextPrime();
      } else {
        this.currentPower = nextPower;
      }

      return;
    }

    this.moveToNextPrime();
  }

  private moveToNextPrime(): void {
    this.primeIndex++;
    this.currentPower = 0n;
  }
}
