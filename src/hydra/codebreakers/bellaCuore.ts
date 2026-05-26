import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

type BellaCuoreFeedback =
  | "too-high"
  | "too-low";

type BellaCuoreAttemptLog = {
  passwordAttempted: string;
  data: string;
};

type BellaCuorePuzzle =
  | { kind: "single"; value: number }
  | { kind: "range"; min: number; max: number };

export class BellaCuoreCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat !== "numeric") {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const puzzle = this.parsePuzzle(this.info.targetPasswordData);
    if (puzzle === undefined) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    if (puzzle.kind === "single") {
      return await this.tryExactPassword(puzzle.value.toString());
    }

    return await this.tryRangePassword(puzzle.min, puzzle.max);
  }

  private async tryExactPassword(password: string): Promise<CodebreakerResult> {
    const result = await this.authenticate(password);
    if (result === null) return { result: "transient" };
    if (result.success) return { result: "ok", password };

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private async tryRangePassword(min: number, max: number): Promise<CodebreakerResult> {
    let low = min;
    let high = max;

    const maxAttempts = Math.ceil(Math.log2(max - min + 1)) + 3;

    for (let i = 0; i < maxAttempts && low <= high; i++) {
      const guess = Math.floor((low + high) / 2);
      const password = guess.toString();

      const result = await this.authenticate(password);
      if (result === null) return { result: "transient" };
      if (result.success) return { result: "ok", password };

      const feedback = await this.readFeedbackForPassword(password);
      if (feedback === undefined) {
        return { result: "transient" };
      }

      if (feedback === "too-high") {
        high = guess - 1;
      } else {
        low = guess + 1;
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private async readFeedbackForPassword(password: string): Promise<BellaCuoreFeedback | undefined> {
    const info = await this.ns.dnet.heartbleed(this.info.targetIp, {
      logsToCapture: 20,
      peek: true,
    });

    if (!info.success) {
      return undefined;
    }

    for (const log of info.logs) {
      const parsed = this.parseAttemptLog(log);

      if (parsed?.passwordAttempted !== password) {
        continue;
      }

      return this.parseFeedback(parsed.data);
    }

    return undefined;
  }

  private parseAttemptLog(log: string): BellaCuoreAttemptLog | undefined {
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

  private parseFeedback(data: string): BellaCuoreFeedback | undefined {
    const normalized = data.trim().toUpperCase();

    if (normalized === "ALTUS NIMIS") {
      return "too-high";
    }

    if (normalized === "PARUM BREVIS") {
      return "too-low";
    }

    return undefined;
  }

  private parsePuzzle(data: string): BellaCuorePuzzle | undefined {
    const parts = data
      .split(",")
      .map(part => part.trim());

    if (parts.length === 1) {
      const value = this.romanNumeralToNumber(parts[0]);
      return value === undefined ? undefined : { kind: "single", value };
    }

    if (parts.length !== 2) {
      return undefined;
    }

    const start = this.romanNumeralToNumber(parts[0]);
    const end = this.romanNumeralToNumber(parts[1]);

    if (start === undefined || end === undefined) {
      return undefined;
    }

    return {
      kind: "range",
      min: Math.min(start, end),
      max: Math.max(start, end),
    };
  }

  private romanNumeralToNumber(roman: string): number | undefined {
    const normalized = roman.trim().toUpperCase();

    if (normalized === "NULLA") {
      return 0;
    }

    if (!/^[IVXLCDM]+$/.test(normalized)) {
      return undefined;
    }

    const values: Record<string, number> = {
      I: 1,
      V: 5,
      X: 10,
      L: 50,
      C: 100,
      D: 500,
      M: 1000,
    };

    let total = 0;
    let previous = 0;

    for (let i = normalized.length - 1; i >= 0; i--) {
      const current = values[normalized[i]];

      if (current < previous) {
        total -= current;
      } else {
        total += current;
      }

      previous = current;
    }

    return total;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
