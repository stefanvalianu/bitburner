import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult, PasswordAttemptLog } from "./codebreaker";

export class FactoriOsCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat !== "numeric") {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const solver = new DivisiblePasswordSolver(this.target.passwordLength);
    
    let passwordNum = solver.nextGuess();
    if (passwordNum === null) return { result: "impossible" };
    let password = passwordNum.toString();
    let result = await this.authenticate(password);

    let maxAttempts = 100;
    while (maxAttempts-- > 0) {
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password: password! };
      } else {
        const info = await this.ns.dnet.heartbleed(this.targetIp);

        if (info.success && info.logs.length > 0) {
          let logResult: PasswordAttemptLog | undefined;
          
          try {
            logResult = JSON.parse(info.logs[0]) as PasswordAttemptLog;
          } catch {}

          if (logResult && logResult.passwordAttempted && logResult.data) {
            const feedback = Boolean(logResult.data);
            solver.giveFeedback(Number(logResult.passwordAttempted), feedback);

            passwordNum = solver.nextGuess();
            if (passwordNum === null) return { result: "impossible" };
            password = passwordNum.toString();
            result = await this.authenticate(password!);
          }
          // we probably read some other crappy log, keep trying (stay in the loop)
        } 
        else {
          // some other hydra instance is competing with us for logs, let them get it
          return { result: "transient" };
        }
      }
    }

    if (maxAttempts === 0) {
      this.ns.tprint(`Ran out of attempts solving factoriOs`);
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}

export class DivisiblePasswordSolver {
  private readonly min: number;
  private readonly max: number;
  private readonly sparseThreshold: number;

  private readonly candidates: number[];
  private readonly alive: Uint8Array;

  private remaining: number;
  private pendingGuess: number | null = null;

  constructor(length: number) {

    this.min = length === 1 ? 1 : 10 ** (length - 1);
    this.max = 10 ** length - 1;

    const total = this.max - this.min + 1;

    this.sparseThreshold = 20_000;
    this.remaining = total;

    this.candidates = Array(total);
    this.alive = new Uint8Array(total);

    for (let i = 0; i < total; i++) {
      this.candidates[i] = this.min + i;
      this.alive[i] = 1;
    }
  }

  public isSolved(): boolean {
    return this.remaining === 1;
  }

  public getAnswer(): number | null {
    return this.remaining === 1 ? this.candidates[0] : null;
  }

  public getRemainingCount(): number {
    return this.remaining;
  }

  public nextGuess(): number | null {
    if (this.remaining === 1) {
      return null;
    }

    if (this.pendingGuess !== null) {
      return this.pendingGuess;
    }

    const guess =
      this.remaining <= this.sparseThreshold
        ? this.chooseBestGuessSparse()
        : this.chooseBestGuessDense();

    this.pendingGuess = guess;
    return guess;
  }

  public giveFeedback(guess: number, isDivisibleByGuess: boolean): void {
    if (this.remaining === 1) {
      return;
    }

    if (this.pendingGuess !== null && guess !== this.pendingGuess) {
      throw new Error(
        `Expected feedback for guess ${this.pendingGuess}, but got ${guess}`,
      );
    }

    let write = 0;

    for (let read = 0; read < this.remaining; read++) {
      const candidate = this.candidates[read];
      const divisible = candidate % guess === 0;

      if (divisible === isDivisibleByGuess) {
        this.candidates[write++] = candidate;
      } else {
        this.alive[candidate - this.min] = 0;
      }
    }

    this.remaining = write;
    this.pendingGuess = null;

    if (this.remaining === 0) {
      throw new Error(`No candidates remain after guess ${guess}`);
    }
  }

  private chooseBestGuessDense(): number {
    const target = this.remaining / 2;

    let bestGuess = -1;
    let bestDiff = Infinity;

    for (let guess = 2; guess <= this.max; guess++) {
      let hits = 0;

      const firstMultiple = Math.ceil(this.min / guess) * guess;

      for (let n = firstMultiple; n <= this.max; n += guess) {
        hits += this.alive[n - this.min];
      }

      if (hits === 0 || hits === this.remaining) {
        continue;
      }

      const diff = Math.abs(target - hits);

      if (diff < bestDiff || (diff === bestDiff && guess > bestGuess)) {
        bestDiff = diff;
        bestGuess = guess;

        if (diff === 0) {
          break;
        }
      }
    }

    if (bestGuess === -1) {
      return this.candidates[0];
    }

    return bestGuess;
  }

  private chooseBestGuessSparse(): number {
    const divisorCounts = new Map<number, number>();

    for (let i = 0; i < this.remaining; i++) {
      const n = this.candidates[i];

      this.increment(divisorCounts, n);

      for (let d = 2; d * d <= n; d++) {
        if (n % d !== 0) {
          continue;
        }

        this.increment(divisorCounts, d);

        const other = n / d;
        if (other !== d) {
          this.increment(divisorCounts, other);
        }
      }
    }

    const target = this.remaining / 2;

    let bestGuess = -1;
    let bestDiff = Infinity;

    for (const [guess, hits] of divisorCounts) {
      if (hits === 0 || hits === this.remaining) {
        continue;
      }

      const diff = Math.abs(target - hits);

      if (diff < bestDiff || (diff === bestDiff && guess > bestGuess)) {
        bestDiff = diff;
        bestGuess = guess;
      }
    }

    if (bestGuess === -1) {
      return this.candidates[0];
    }

    return bestGuess;
  }

  private increment(map: Map<number, number>, key: number): void {
    map.set(key, (map.get(key) ?? 0) + 1);
  }
}
