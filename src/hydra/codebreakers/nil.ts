import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

const DIGITS = "0123456789";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LETTERS = LOWERCASE + UPPERCASE;
const ALPHANUMERIC = DIGITS + LETTERS;

type NilFeedbackLog = {
  passwordAttempted: string;
  data: string;
};

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
    .map(token => token.trim())
    .filter(token => token.length > 0)
    .map(parseYesntToken);
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
  private readonly possibleByPosition: string[][];
  private readonly fixed: Array<string | null>;

  constructor(
    private readonly length: number,
    alphabet: string,
  ) {
    const uniqueAlphabet = [...new Set(alphabet.split(""))];

    if (uniqueAlphabet.length === 0) {
      throw new Error("Alphabet must not be empty");
    }

    this.possibleByPosition = Array.from(
      { length },
      () => [...uniqueAlphabet],
    );

    this.fixed = Array.from({ length }, () => null);
  }

  get solved(): boolean {
    return this.fixed.every(char => char !== null);
  }

  get password(): string | null {
    return this.solved ? this.fixed.join("") : null;
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
        char => char !== guessedChar,
      );

      if (this.possibleByPosition[i].length === 1) {
        this.fixed[i] = this.possibleByPosition[i][0];
      }
    }
  }
}

export class NilCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordLength <= 0) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const alphabet = alphabetForPasswordFormat(this.target.passwordFormat);
    const solver = new NilSolver(this.target.passwordLength, alphabet);

    const maxAttempts = this.target.passwordLength * alphabet.length + 2;

    for (let i = 0; i < maxAttempts; i++) {
      const password = solver.nextGuess();
      const result = await this.authenticate(password);

      if (result === null) return { result: "transient" };
      if (result.success) return { result: "ok", password };

      const feedback = await this.readFeedbackForPassword(password);

      if (feedback === undefined) {
        return { result: "transient" };
      }

      solver.applyFeedback(feedback.passwordAttempted, feedback.data);

      const solvedPassword = solver.password;
      if (solvedPassword !== null) {
        const finalResult = await this.authenticate(solvedPassword);

        if (finalResult === null) return { result: "transient" };
        if (finalResult.success) return { result: "ok", password: solvedPassword };

        this.printCoreInfo();
        return { result: "impossible" };
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private async readFeedbackForPassword(password: string): Promise<NilFeedbackLog | undefined> {
    const info = await this.ns.dnet.heartbleed(this.targetIp, {
      logsToCapture: 20,
      peek: true,
    });

    if (!info.success) {
      return undefined;
    }

    for (const log of info.logs) {
      const parsed = this.parseFeedbackLog(log);

      if (
        parsed !== undefined &&
        parsed.passwordAttempted === password &&
        parsed.data.length > 0
      ) {
        return parsed;
      }
    }

    return undefined;
  }

  private parseFeedbackLog(log: string): NilFeedbackLog | undefined {
    let parsed: unknown;

    try {
      parsed = JSON.parse(log);
    } catch {
      return undefined;
    }

    const message = this.getMessageObject(parsed);

    if (!this.isRecord(message)) {
      return undefined;
    }

    const passwordAttempted = message.passwordAttempted;
    const data = message.data;

    if (typeof passwordAttempted !== "string" || typeof data !== "string") {
      return undefined;
    }

    return { passwordAttempted, data };
  }

  private getMessageObject(value: unknown): unknown {
    if (!this.isRecord(value)) {
      return value;
    }

    const message = value.message;

    if (typeof message === "string") {
      try {
        return JSON.parse(message);
      } catch {
        return message;
      }
    }

    return message ?? value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
