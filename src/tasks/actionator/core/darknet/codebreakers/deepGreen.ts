import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

interface PasswordAttemptLog {
  data: string;
  passwordAttempted: string;
}

class DigitSolver {
  private readonly max: number;
  private readonly alive: Uint8Array;

  private readonly secretCounts = new Uint8Array(10);
  private readonly guessCounts = new Uint8Array(10);

  private remaining = 0;

  constructor(private readonly digitCount: number) {
    if (!Number.isInteger(digitCount) || digitCount <= 0) {
      throw new Error("digitCount must be a positive integer");
    }

    this.max = 10 ** digitCount;
    this.alive = new Uint8Array(this.max);
    this.alive.fill(1);

    this.remaining = this.max;
  }

  get remainingCount(): number {
    return this.remaining;
  }

  nextGuess(): string | null {
    for (let candidate = 0; candidate < this.max; candidate++) {
      if (this.alive[candidate] === 1) {
        return this.format(candidate);
      }
    }

    return null;
  }

  applyFeedback(guess: string, exact: number, misplaced: number): void {
    const guessNumber = this.parseGuess(guess);

    for (let candidate = 0; candidate < this.max; candidate++) {
      if (this.alive[candidate] === 0) continue;

      const matches = this.matchesFeedback(
        candidate,
        guessNumber,
        exact,
        misplaced
      );

      if (!matches) {
        this.alive[candidate] = 0;
        this.remaining--;
      }
    }
  }

  private matchesFeedback(
    secretNumber: number,
    guessNumber: number,
    expectedExact: number,
    expectedMisplaced: number
  ): boolean {
    this.secretCounts.fill(0);
    this.guessCounts.fill(0);

    let exact = 0;

    for (let i = 0; i < this.digitCount; i++) {
      const secretDigit = secretNumber % 10;
      const guessDigit = guessNumber % 10;

      secretNumber = Math.floor(secretNumber / 10);
      guessNumber = Math.floor(guessNumber / 10);

      if (secretDigit === guessDigit) {
        exact++;
      } else {
        this.secretCounts[secretDigit]++;
        this.guessCounts[guessDigit]++;
      }
    }

    if (exact !== expectedExact) {
      return false;
    }

    let misplaced = 0;

    for (let digit = 0; digit <= 9; digit++) {
      misplaced += Math.min(this.secretCounts[digit], this.guessCounts[digit]);
    }

    return misplaced === expectedMisplaced;
  }

  private parseGuess(guess: string): number {
    if (guess.length !== this.digitCount) {
      throw new Error(`Guess must have exactly ${this.digitCount} digits`);
    }

    if (!/^\d+$/.test(guess)) {
      throw new Error("Guess must contain only digits");
    }

    return Number(guess);
  }

  private format(candidate: number): string {
    return candidate.toString().padStart(this.digitCount, "0");
  }
}

export class DeepGreenCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "numeric") {
      const solver = new DigitSolver(this.target.passwordLength);
      
      let password = solver.nextGuess();
      if (password === null) return { result: "impossible" };
      let result = await this.ns.dnet.authenticate(this.target.hostname, password!);

      // time to play some wordle
      while (solver.remainingCount > 0) {
        if (result.success) {
          return { result: "ok", password: password! };
        } else {
          /*
            Reminder that multiple different instances of this hydra (on different hosts) could
            be consuming the log.
          */
          const info = await this.ns.dnet.heartbleed(this.target.hostname);

          if (info.success && info.logs.length > 0) {
            let logResult: PasswordAttemptLog | undefined;
            
            try {
              logResult = JSON.parse(info.logs[0]) as PasswordAttemptLog;
            } catch {}

            if (logResult && logResult.passwordAttempted && logResult.data) {
              const feedback = logResult.data.split(",").map(s => s.trim());
              solver.applyFeedback(logResult.passwordAttempted, Number(feedback[0]), Number(feedback[1]));

              password = solver.nextGuess();
              result = await this.ns.dnet.authenticate(this.target.hostname, password!);
            }
            // we probably read some other crappy log, keep trying (stay in the loop)
          } 
          else {
            // some other hydra instance is competing with us for logs, let them get it
            return { result: "insufficient_data" };
          }
        }
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}
