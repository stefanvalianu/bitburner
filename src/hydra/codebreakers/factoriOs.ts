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

export class FactoriOsCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat !== "numeric") {
      return { result: "failed" };
    }

    const solver = new DivisiblePasswordSolver(
      this.info.targetPasswordLength,
      this.info.targetPasswordDifficulty,
    );

    for (let attempts = 0; attempts < 250; attempts++) {
      const password = solver.nextGuess();
      if (password === null) {
        break;
      }

      const result = await this.authenticate(password);

      if (result === "transient") return { result: "transient" };
      if (result === "ok") return { result: "ok", password };

      const feedback = await this.readFeedbackForPassword(password);
      if (feedback === undefined) {
        return { result: "transient" };
      }

      solver.giveFeedback(password, feedback);
    }

    return { result: "failed" };
  }

  private async readFeedbackForPassword(password: string): Promise<boolean | undefined> {
    const info = await this.getAuthenticateResultLog(password);

    if (info.result !== "ok" || !info.log) {
      return undefined;
    }

    if (info.log.data === "true") return true;
    if (info.log.data === "false") return false;

    return undefined;
  }
}

export class DivisiblePasswordSolver {
  private readonly primes: number[];
  private readonly maxGuess: bigint;

  private primeIndex = 0;
  private currentPower = 0n;
  private answer = 1n;

  private pendingGuess: bigint | null = null;
  private finalGuessReturned = false;

  constructor(length: number, difficulty = Number.POSITIVE_INFINITY) {
    const safeLength = Math.max(1, Math.floor(length));
    const maxByLength = 10n ** BigInt(safeLength) - 1n;

    this.maxGuess = maxByLength;
    this.primes = difficulty > 12
      ? [...SMALL_PRIMES, ...LARGE_PRIMES]
      : SMALL_PRIMES;
  }

  public isSolved(): boolean {
    return this.primeIndex >= this.primes.length;
  }

  public getAnswer(): string | null {
    if (!this.isSolved()) return null;
    if (!this.isRepresentableByGameNumber(this.answer)) return null;
    return this.answer.toString();
  }

  public getRemainingCount(): number {
    return this.isSolved() ? 1 : -1;
  }

  public nextGuess(): string | null {
    if (this.pendingGuess !== null) {
      return this.pendingGuess.toString();
    }

    while (this.primeIndex < this.primes.length) {
      const prime = BigInt(this.primes[this.primeIndex]);

      if (this.currentPower === 0n) {
        this.currentPower = prime;
      }

      if (this.currentPower > this.maxGuess || !this.isRepresentableByGameNumber(this.currentPower)) {
        this.moveToNextPrime();
        continue;
      }

      this.pendingGuess = this.currentPower;
      return this.pendingGuess.toString();
    }

    if (this.finalGuessReturned) {
      return null;
    }

    this.finalGuessReturned = true;

    if (this.answer < 1n || this.answer > this.maxGuess || !this.isRepresentableByGameNumber(this.answer)) {
      return null;
    }

    this.pendingGuess = this.answer;
    return this.pendingGuess.toString();
  }

  public giveFeedback(guess: string, isDivisibleByGuess: boolean): void {
    const guessedPower = BigInt(guess);

    if (this.pendingGuess !== null && guessedPower !== this.pendingGuess) {
      throw new Error(
        `Expected feedback for guess ${this.pendingGuess}, but got ${guess}`,
      );
    }

    this.pendingGuess = null;

    if (this.primeIndex >= this.primes.length) {
      return;
    }

    const prime = BigInt(this.primes[this.primeIndex]);

    if (isDivisibleByGuess) {
      this.answer *= prime;

      const nextPower = guessedPower * prime;
      if (nextPower > this.maxGuess || !this.isRepresentableByGameNumber(nextPower)) {
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

  private isRepresentableByGameNumber(value: bigint): boolean {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) && BigInt(asNumber) === value;
  }
}
