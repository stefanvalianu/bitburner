import { NS } from "@ns";
import { Codebreaker, CodebreakerResult, PasswordAttemptLog } from "./codebreaker";
import { HydraAuthInfo } from "../types";

const DIGITS = "0123456789";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LETTERS = LOWERCASE + UPPERCASE;
const ALPHANUMERIC = DIGITS + LETTERS;

function alphabetForPasswordFormat(format: string): string {
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

function parseYesntFeedback(response: string): boolean[] {
  return response
    .split(",")
    .map(token => parseYesntToken(token));
}

function parseYesntToken(token: string): boolean {
  const normalized = token
    .trim()
    .toLowerCase()
    .replaceAll("’", "'")
    .replace(/^["']|["']$/g, "");

  switch (normalized) {
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
  private readonly alphabet: string[];
  private readonly nextIndexByPosition: number[];
  private readonly fixed: Array<string | null>;

  constructor(private readonly length: number, alphabet: string) {
    this.alphabet = [...new Set(alphabet.split(""))];

    if (this.length <= 0) {
      throw new Error("Length must be positive");
    }

    if (this.alphabet.length === 0) {
      throw new Error("Alphabet must not be empty");
    }

    this.nextIndexByPosition = Array.from({ length }, () => 0);
    this.fixed = Array.from({ length }, () => null);
  }

  get solved(): boolean {
    return this.fixed.every(char => char !== null);
  }

  get password(): string | null {
    return this.solved ? this.fixed.join("") : null;
  }

  get maxAttempts(): number {
    return this.alphabet.length + 2;
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

      const char = this.alphabet[this.nextIndexByPosition[i]];

      if (char === undefined) {
        throw new Error(`No possible characters left at position ${i}`);
      }

      guess += char;
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
      if (this.fixed[i] !== null) {
        continue;
      }

      if (feedback[i]) {
        this.fixed[i] = guess[i];
        continue;
      }

      this.nextIndexByPosition[i]++;

      if (this.nextIndexByPosition[i] >= this.alphabet.length) {
        throw new Error(`No possible characters left at position ${i}`);
      }
    }
  }
}

export class NilCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordLength <= 0) {
      return { result: "impossible" };
    }

    const alphabet = alphabetForPasswordFormat(this.info.targetPasswordFormat);
    const solver = new NilSolver(this.info.targetPasswordLength, alphabet);

    for (let i = 0; i < solver.maxAttempts; i++) {
      const password = solver.nextGuess();
      const result = await this.authenticate(password);

      if (result === "transient") return { result: "transient" };
      if (result === "ok") return { result: "ok", password };

      const feedback = await this.readFeedbackForPassword(password);

      if (feedback === undefined) {
        // This is not a logical NIL failure. It means heartbleed/log parsing did not
        // recover feedback for the exact password we just attempted.
        return { result: "transient" };
      }

      solver.applyFeedback(password, feedback.data);

      const solvedPassword = solver.password;
      if (solvedPassword !== null) {
        const finalResult = await this.authenticate(solvedPassword);

        if (finalResult === "transient") return { result: "transient" };
        if (finalResult === "ok") return { result: "ok", password: solvedPassword };

        return { result: "impossible" };
      }
    }

    return { result: "impossible" };
  }

  private async readFeedbackForPassword(password: string): Promise<PasswordAttemptLog | undefined> {
    const info = await this.getAuthenticateResultLog(password);

    if (info.result !== "ok" || !info.log) {
      return undefined;
    }

    return info.log;
  }
}
