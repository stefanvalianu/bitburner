import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

const DIGITS = "0123456789";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LETTERS = LOWERCASE + UPPERCASE;
const ALPHANUMERIC = DIGITS + LETTERS;

type MastermindFeedback = {
  passwordAttempted: string;
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
    const filler = this.fillerForAlphabet(alphabet);

    if (length <= 0 || alphabet.length === 0 || filler === undefined) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const charCounts = new Map<string, number>();

    // Phase 1: discover the password multiset.
    for (const char of alphabet) {
      const password = char.repeat(length);
      const attempted = await this.tryPasswordAndReadFeedback(password);

      if (attempted.kind === "transient") return { result: "transient" };
      if (attempted.kind === "success") return { result: "ok", password };
      if (attempted.kind !== "feedback") {
        this.printCoreInfo();
        return { result: "impossible" };
      }

      const count = attempted.feedback.exact + attempted.feedback.misplaced;
      if (count > 0) {
        charCounts.set(char, count);
      }
    }

    const totalKnownChars = [...charCounts.values()].reduce((sum, count) => sum + count, 0);
    if (totalKnownChars !== length) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const passwordChars: Array<string | null> = Array.from({ length }, () => null);

    // Phase 2: discover positions.
    for (const [char, count] of charCounts) {
      let found = 0;

      for (let index = 0; index < length && found < count; index++) {
        if (passwordChars[index] !== null) continue;

        const password = this.singlePositionGuess(length, index, char, filler);
        const attempted = await this.tryPasswordAndReadFeedback(password);

        if (attempted.kind === "transient") return { result: "transient" };
        if (attempted.kind === "success") return { result: "ok", password };
        if (attempted.kind !== "feedback") {
          this.printCoreInfo();
          return { result: "impossible" };
        }

        if (attempted.feedback.exact === 1) {
          passwordChars[index] = char;
          found++;
        }
      }

      if (found !== count) {
        this.printCoreInfo();
        return { result: "impossible" };
      }
    }

    if (passwordChars.some(char => char === null)) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const password = passwordChars.join("");
    const result = await this.authenticate(password);

    if (result === null) return { result: "transient" };
    if (result.success) return { result: "ok", password };

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
    if (feedback !== undefined) {
      return { kind: "feedback", feedback };
    }

    return { kind: "unknown" };
  }

  private async readFeedbackForPassword(password: string): Promise<MastermindFeedback | undefined> {
    const info = await this.ns.dnet.heartbleed(this.targetIp, {
      logsToCapture: 20,
      peek: true,
    });

    if (!info.success) {
      return undefined;
    }

    for (const log of info.logs) {
      const feedback = this.parseFeedbackLog(log);

      if (feedback !== undefined && feedback.passwordAttempted === password) {
        return feedback;
      }
    }

    return undefined;
  }

  private parseFeedbackLog(log: string): MastermindFeedback | undefined {
    let parsed: unknown;

    try {
      parsed = JSON.parse(log);
    } catch {
      return undefined;
    }

    const message = this.unwrapLogMessage(parsed);
    if (!this.isRecord(message)) {
      return undefined;
    }

    const passwordAttempted = message.passwordAttempted;
    const data = message.data;

    if (typeof passwordAttempted !== "string" || typeof data !== "string") {
      return undefined;
    }

    const feedback = this.parseFeedbackData(data);
    if (feedback === undefined) {
      return undefined;
    }

    return {
      passwordAttempted,
      exact: feedback.exact,
      misplaced: feedback.misplaced,
    };
  }

  private unwrapLogMessage(value: unknown): unknown {
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

  private parseFeedbackData(data: string): { exact: number; misplaced: number } | undefined {
    const match = data.match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);
    if (!match) {
      return undefined;
    }

    return {
      exact: Number(match[1]),
      misplaced: Number(match[2]),
    };
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

  private fillerForAlphabet(alphabet: string): string | undefined {
    for (const char of "~!@#$%^&*()_+-=[]{}|;:,.<>?") {
      if (!alphabet.includes(char)) {
        return char;
      }
    }

    return undefined;
  }

  private singlePositionGuess(length: number, index: number, char: string, filler: string): string {
    const guess = Array.from({ length }, () => filler);
    guess[index] = char;
    return guess.join("");
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
