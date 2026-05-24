import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

const DIGITS = "0123456789";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";

interface PasswordAttemptLog {
  data: string;
  passwordAttempted: string;
}

function alphabetForPasswordFormat(format: string): string {
  switch (format) {
    case "numeric":
      return DIGITS;
    case "alphabetic":
      return LOWERCASE;
    default:
      return DIGITS + LOWERCASE;
  }
}

function parseYesntFeedback(response: string): boolean[] {
  return response
    .split(",")
    .map(token => token.trim())
    .filter(token => token.length > 0)
    .map(parseYesntToken);
}

function parseYesntToken(token: string): boolean {
  switch (token.toLowerCase()) {
    case "yes":
      return true;

    case "yesn't":
    case "yesnt":
      return false;

    default:
      throw new Error(`Unknown NIL feedback token: ${token}`);
  }
}

class NilSolver {
  private readonly possibleByPosition: string[][];
  private readonly fixed: Array<string | null>;

  constructor(
    private readonly length: number,
    alphabet: string,
    options?: {
      allowLeadingZero?: boolean;
    }
  ) {
    const uniqueAlphabet = [...new Set(alphabet.split(""))];

    if (uniqueAlphabet.length === 0) {
      throw new Error("Alphabet must not be empty");
    }

    const allowLeadingZero = options?.allowLeadingZero ?? true;

    this.possibleByPosition = Array.from({ length }, (_, index) => {
      let chars = [...uniqueAlphabet];

      if (index === 0 && length > 1 && !allowLeadingZero) {
        chars = chars.filter(char => char !== "0");
      }

      return chars;
    });

    this.fixed = Array.from({ length }, () => null);
  }

  get solved(): boolean {
    return this.fixed.every(char => char !== null);
  }

  get password(): string | null {
    return this.solved ? this.fixed.join("") : null;
  }

  get knownPattern(): string {
    return this.fixed.map(char => char ?? "?").join("");
  }

  nextGuess(): string {
    const solvedPassword = this.password;

    if (solvedPassword !== null) {
      return solvedPassword;
    }

    let guess = "";

    for (let i = 0; i < this.length; i++) {
      const fixedChar = this.fixed[i];

      if (fixedChar !== null) {
        guess += fixedChar;
        continue;
      }

      const nextPossibleChar = this.possibleByPosition[i][0];

      if (nextPossibleChar === undefined) {
        throw new Error(`No possible characters left at position ${i}`);
      }

      guess += nextPossibleChar;
    }

    return guess;
  }

  applyFeedback(guess: string, positions: string): void {
    if (guess.length !== this.length) {
      throw new Error(`Guess length ${guess.length} did not match expected length ${this.length}`);
    }

    const feedback = parseYesntFeedback(positions);

    if (feedback.length !== this.length) {
      throw new Error(`Feedback length ${feedback.length} did not match expected length ${this.length}`);
    }

    for (let i = 0; i < this.length; i++) {
      const guessedChar = guess[i];
      const wasCorrect = feedback[i];

      if (wasCorrect) {
        this.fixed[i] = guessedChar;
        this.possibleByPosition[i] = [guessedChar];
        continue;
      }

      if (this.fixed[i] === guessedChar) {
        throw new Error(`Contradiction at position ${i}: known '${guessedChar}' was reported incorrect`);
      }

      this.possibleByPosition[i] = this.possibleByPosition[i].filter(
        char => char !== guessedChar
      );

      if (this.possibleByPosition[i].length === 1) {
        this.fixed[i] = this.possibleByPosition[i][0];
      }
    }
  }
}

export class NilCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const solver = new NilSolver(
      this.target.passwordLength,
     alphabetForPasswordFormat(this.target.passwordFormat), {
      allowLeadingZero: this.target.passwordFormat !== "numeric",
     });
    
    let password = solver.nextGuess();
    let result = await this.authenticate(this.target.hostname, password!);

    // time to play some wordle
    while (!solver.solved) {
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password: password };
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
            solver.applyFeedback(logResult.passwordAttempted, logResult.data);

            password = solver.nextGuess();
            result = await this.ns.dnet.authenticate(this.target.hostname, password!);
          }
          // we probably read some other crappy log, keep trying (stay in the loop)
        } 
        else {
          // some other hydra instance is competing with us for logs, let them get it
          return { result: "transient" };
        }
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}
