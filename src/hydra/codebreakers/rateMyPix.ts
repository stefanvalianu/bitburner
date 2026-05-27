import { NS } from "@ns";
import { Codebreaker, CodebreakerResult, PasswordAttemptLog } from "./codebreaker";
import { HydraAuthInfo } from "../types";

const DIGITS = "0123456789";
const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALPHANUMERIC = DIGITS + LETTERS;

export class RateMyPixCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordLength <= 0) {
      return { result: "failed" };
    }

    const alphabet = alphabetForPasswordFormat(this.info.targetPasswordFormat);
    const solver = new RateMyPixAuthCracker(this.info.targetPasswordLength, alphabet);

    for (let attempts = 0; attempts < solver.maxAttempts; attempts++) {
      const password = solver.nextGuess();

      if (password === null) {
        return { result: "failed" };
      }

      const result = await this.authenticate(password);

      if (result === "transient") return { result: "transient" };
      if (result === "ok") return { result: "ok", password };

      const feedback = await this.readFeedbackForPassword(password);

      if (feedback === undefined) {
        return { result: "transient" };
      }

      solver.giveFeedback(password, feedback.data);
    }

    return { result: "failed" };
  }

  private async readFeedbackForPassword(password: string): Promise<PasswordAttemptLog | undefined> {
    const info = await this.getAuthenticateResultLog(password);

    if (info.result !== "ok" || !info.log) {
      return undefined;
    }

    return info.log;
  }
}

class RateMyPixAuthCracker {
  private readonly baseChar = "_";
  private readonly candidates: string[];
  private readonly knownPassword: Array<string | null>;

  private position = 0;
  private candidateIndex = 0;
  private pendingGuess: string | null = null;

  constructor(
    private readonly passwordLength: number,
    alphabet = ALPHANUMERIC,
  ) {
    this.candidates = [...new Set(alphabet.split(""))];

    if (this.passwordLength <= 0) {
      throw new Error("Password length must be positive.");
    }

    if (this.candidates.length === 0) {
      throw new Error("Alphabet must not be empty.");
    }

    if (this.candidates.includes(this.baseChar)) {
      throw new Error(`Alphabet must not include '${this.baseChar}'.`);
    }

    this.knownPassword = Array.from({ length: passwordLength }, () => null);
  }

  public get maxAttempts(): number {
    return this.passwordLength * this.candidates.length + 2;
  }

  public nextGuess(): string | null {
    const solvedPassword = this.password;
    if (solvedPassword !== null) {
      this.pendingGuess = solvedPassword;
      return solvedPassword;
    }

    if (this.position >= this.passwordLength) {
      return null;
    }

    if (this.candidateIndex >= this.candidates.length) {
      throw new Error(`Exhausted alphabet while solving position ${this.position}.`);
    }

    const guess = this.createSinglePositionGuess(
      this.position,
      this.candidates[this.candidateIndex],
    );

    this.pendingGuess = guess;
    return guess;
  }

  public giveFeedback(lastGuess: string, feedback: string): void {
    if (this.pendingGuess !== null && lastGuess !== this.pendingGuess) {
      throw new Error(`Expected feedback for '${this.pendingGuess}', but got '${lastGuess}'.`);
    }

    this.pendingGuess = null;

    const { score, length } = this.parseFeedback(feedback);

    if (length !== this.passwordLength) {
      throw new Error(`Feedback length ${length} did not match expected length ${this.passwordLength}.`);
    }

    if (this.password !== null) {
      return;
    }

    if (score === 1) {
      this.knownPassword[this.position] = this.candidates[this.candidateIndex];
      this.position++;
      this.candidateIndex = 0;
      return;
    }

    if (score === 0) {
      this.candidateIndex++;
      return;
    }

    throw new Error(`Unexpected RateMyPix score ${score}; expected 0 or 1 for a single-position guess.`);
  }

  private get password(): string | null {
    return this.knownPassword.every(char => char !== null)
      ? this.knownPassword.join("")
      : null;
  }

  private createSinglePositionGuess(position: number, candidate: string): string {
    const guess = Array.from({ length: this.passwordLength }, () => this.baseChar);
    guess[position] = candidate;
    return guess.join("");
  }

  private parseFeedback(feedback: string): { score: number; length: number } {
    // eslint-disable-next-line no-control-regex -- Intentionally matching ANSI escape/control sequences.
    const cleaned = feedback.replace(/\u{001B}\[[0-9;]*m/gu, "").trim();

    const match = cleaned.match(/^(.+)\/(\d+)$/);

    if (!match) {
      throw new Error(`Invalid RateMyPix feedback: '${feedback}'.`);
    }

    return {
      score: this.parseScore(match[1]),
      length: Number(match[2]),
    };
  }

  private parseScore(scoreText: string): number {
    const value = scoreText.trim();

    if (value === "0") {
      return 0;
    }

    // Current source uses U+FE0F as the per-correct-character marker.
    // If a future UI renders a full emoji+variation-selector pair, counting
    // U+FE0F still gives one marker per correct character.
    const variationSelectorCount = Array.from(value).filter(char => char === "\uFE0F").length;
    if (variationSelectorCount > 0) {
      return variationSelectorCount;
    }

    return Array.from(value).length;
  }
}

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
