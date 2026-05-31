import { NS } from "@ns";
import { Codebreaker, CodebreakerResult, PasswordAttemptLog } from "./codebreaker";
import { HydraAuthInfo } from "../types";

const DIGITS = "0123456789";
const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALPHANUMERIC = DIGITS + LETTERS;

export class RateMyPixCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const length = this.info.targetPasswordLength;

    if (!Number.isInteger(length) || length <= 0) {
      return { result: "failed" };
    }

    const alphabet = alphabetForPasswordFormat(this.info.targetPasswordFormat);
    const solver = new RateMyPixAuthCracker(length, alphabet);

    while (!solver.solved) {
      const char = solver.nextUnresolvedChar();

      if (char === null) break;

      const positions = solver.unknownPositions;
      const count = await this.queryCharCount(char, positions);

      if (count.kind === "transient") return { result: "transient" };
      if (count.kind === "success") return { result: "ok", password: count.password };
      if (count.count < 0 || count.count > positions.length) return { result: "failed" };

      if (count.count === 0) {
        solver.markCharResolved(char, []);
        continue;
      }

      if (count.count === positions.length) {
        solver.markCharResolved(char, positions);
        continue;
      }

      const matched = await this.locateCharPositions(char, positions, count.count);

      if (matched.kind === "transient") return { result: "transient" };
      if (matched.kind === "success") return { result: "ok", password: matched.password };

      solver.markCharResolved(char, matched.positions);
    }

    const password = solver.password;

    if (password !== null) {
      const result = await this.authenticate(password);

      if (result === "transient") return { result: "transient" };
      if (result === "ok") return { result: "ok", password };
    }

    return { result: "failed" };
  }

  private async locateCharPositions(
    char: string,
    positions: number[],
    count: number,
  ): Promise<LocateResult> {
    if (count === 0) return { kind: "positions", positions: [] };
    if (count === positions.length) return { kind: "positions", positions };
    if (positions.length === 1) {
      return count === 1
        ? { kind: "positions", positions }
        : { kind: "positions", positions: [] };
    }

    const splitIndex = Math.floor(positions.length / 2);
    const left = positions.slice(0, splitIndex);
    const right = positions.slice(splitIndex);
    const leftCount = await this.queryCharCount(char, left);

    if (leftCount.kind === "transient") return { kind: "transient" };
    if (leftCount.kind === "success") return { kind: "success", password: leftCount.password };
    if (leftCount.count < 0 || leftCount.count > left.length || leftCount.count > count) {
      return { kind: "transient" };
    }

    const rightCount = count - leftCount.count;

    if (rightCount < 0 || rightCount > right.length) {
      return { kind: "transient" };
    }

    const leftMatches = await this.locateCharPositions(char, left, leftCount.count);

    if (leftMatches.kind !== "positions") return leftMatches;

    const rightMatches = await this.locateCharPositions(char, right, rightCount);

    if (rightMatches.kind !== "positions") return rightMatches;

    return {
      kind: "positions",
      positions: [...leftMatches.positions, ...rightMatches.positions],
    };
  }

  private async queryCharCount(char: string, positions: number[]): Promise<QueryCountResult> {
    const password = this.createProbePassword(char, positions);
    const result = await this.authenticate(password);

    if (result === "transient") return { kind: "transient" };
    if (result === "ok") return { kind: "success", password };

    const feedback = await this.readFeedbackForPassword(password);

    if (feedback === undefined) {
      return { kind: "transient" };
    }

    const parsed = RateMyPixAuthCracker.parseFeedback(feedback.data);

    if (parsed.length !== this.info.targetPasswordLength) {
      return { kind: "transient" };
    }

    return { kind: "count", count: parsed.score };
  }

  private async readFeedbackForPassword(password: string): Promise<PasswordAttemptLog | undefined> {
    const info = await this.getAuthenticateResultLog(password);

    if (info.result !== "ok" || !info.log) {
      return undefined;
    }

    return info.log;
  }

  private createProbePassword(char: string, positions: number[]): string {
    const guess = Array.from({ length: this.info.targetPasswordLength }, () => RateMyPixAuthCracker.BaseChar);

    for (const position of positions) {
      guess[position] = char;
    }

    return guess.join("");
  }
}

type QueryCountResult =
  | { kind: "count"; count: number }
  | { kind: "success"; password: string }
  | { kind: "transient" };

type LocateResult =
  | { kind: "positions"; positions: number[] }
  | { kind: "success"; password: string }
  | { kind: "transient" };

class RateMyPixAuthCracker {
  public static readonly BaseChar = "_";

  private readonly candidates: string[];
  private readonly knownPassword: Array<string | null>;
  private readonly unresolvedChars: string[];

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

    if (this.candidates.includes(RateMyPixAuthCracker.BaseChar)) {
      throw new Error(`Alphabet must not include '${RateMyPixAuthCracker.BaseChar}'.`);
    }

    this.knownPassword = Array.from({ length: passwordLength }, () => null);
    this.unresolvedChars = [...this.candidates];
  }

  public get solved(): boolean {
    return this.knownPassword.every(char => char !== null);
  }

  public get unknownPositions(): number[] {
    const result: number[] = [];

    for (let i = 0; i < this.knownPassword.length; i++) {
      if (this.knownPassword[i] === null) result.push(i);
    }

    return result;
  }

  public nextUnresolvedChar(): string | null {
    if (this.unresolvedChars.length === 1) {
      this.markCharResolved(this.unresolvedChars[0], this.unknownPositions);
      return null;
    }

    return this.unresolvedChars[0] ?? null;
  }

  public get password(): string | null {
    return this.knownPassword.every(char => char !== null)
      ? this.knownPassword.join("")
      : null;
  }

  public markCharResolved(char: string, positions: number[]): void {
    const expected = this.unresolvedChars[0];

    if (char !== expected) {
      throw new Error(`Expected RateMyPix character '${expected}', but resolved '${char}'.`);
    }

    const unknown = new Set(this.unknownPositions);

    for (const position of positions) {
      if (!unknown.has(position)) {
        throw new Error(`Invalid RateMyPix position ${position} for character '${char}'.`);
      }

      this.knownPassword[position] = char;
    }

    this.unresolvedChars.shift();
  }

  public static parseFeedback(feedback: string): { score: number; length: number } {
    // eslint-disable-next-line no-control-regex -- Intentionally matching ANSI escape/control sequences.
    const cleaned = feedback.replace(/\u{001B}\[[0-9;]*m/gu, "").trim();

    const match = cleaned.match(/^(.+)\/(\d+)$/);

    if (!match) {
      throw new Error(`Invalid RateMyPix feedback: '${feedback}'.`);
    }

    return {
      score: RateMyPixAuthCracker.parseScore(match[1]),
      length: Number(match[2]),
    };
  }

  private static parseScore(scoreText: string): number {
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
