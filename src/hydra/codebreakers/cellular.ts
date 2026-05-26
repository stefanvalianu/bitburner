import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

type TimingTrySolveResult =
  | { kind: "success"; password: string }
  | { kind: "mismatch"; index: number }
  | { kind: "transient" }
  | { kind: "unknown" };

export class TwoGCellularCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const length = this.info.targetPasswordLength;
    const characters = this.charactersForPasswordFormat();

    if (length <= 0 || characters === undefined || characters.length === 0) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    let prefix = "";
    const filler = characters[0];

    for (let index = 0; index < length; index++) {
      let found = false;

      for (const char of characters) {
        const password = prefix + char + filler.repeat(length - index - 1);
        const trysolve = await this.tryPasswordAndReadMismatch(password);

        if (trysolve.kind === "transient") {
          return { result: "transient" };
        }

        if (trysolve.kind === "success") {
          return { result: "ok", password: trysolve.password };
        }

        if (trysolve.kind === "unknown") {
          // Do not continue to the next character. Missing feedback for the
          // current guess would corrupt the prefix search.
          return { result: "transient" };
        }

        if (trysolve.index > index) {
          prefix += char;
          found = true;
          break;
        }

        if (trysolve.index < index) {
          // Our supposedly-known prefix is contradicted. This normally means
          // stale feedback was read or the server changed underneath us.
          return { result: "transient" };
        }
      }

      if (!found) {
        this.printCoreInfo();
        return { result: "impossible" };
      }
    }

    const result = await this.authenticate(prefix);
    if (result === null) return { result: "transient" };
    if (result.success) return { result: "ok", password: prefix };

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private async tryPasswordAndReadMismatch(password: string): Promise<TimingTrySolveResult> {
    const result = await this.authenticate(password);

    if (result === null) {
      return { kind: "transient" };
    }

    if (result.success) {
      return { kind: "success", password };
    }

    const bleed = await this.ns.dnet.heartbleed(this.info.targetIp, {
      logsToCapture: 50,
      peek: true,
    });

    if (!bleed.success) {
      return { kind: "unknown" };
    }

    for (const log of bleed.logs) {
      const mismatch = this.parseMismatchLog(log, password);

      if (mismatch !== undefined) {
        return { kind: "mismatch", index: mismatch };
      }
    }

    return { kind: "unknown" };
  }

  private parseMismatchLog(log: string, expectedPassword: string): number | undefined {
    const parsed = this.tryParseJson(log);
    const candidates: unknown[] = [parsed];

    if (this.isRecord(parsed)) {
      const message = parsed.message;

      if (typeof message === "string") {
        candidates.push(this.tryParseJson(message));
      } else if (message !== undefined) {
        candidates.push(message);
      }
    }

    for (const candidate of candidates) {
      const mismatch = this.parsePasswordResponseMismatch(candidate, expectedPassword);

      if (mismatch !== undefined) {
        return mismatch;
      }
    }

    return undefined;
  }

  private parsePasswordResponseMismatch(value: unknown, expectedPassword: string): number | undefined {
    if (!this.isRecord(value)) {
      return undefined;
    }

    if (value.passwordAttempted !== expectedPassword) {
      return undefined;
    }

    if (typeof value.message !== "string") {
      return undefined;
    }

    return this.parseMismatchIndex(value.message);
  }

  private parseMismatchIndex(value: string): number | undefined {
    const match = value.match(/Found a mismatch while checking each character \((-?\d+)\)/);

    if (!match) {
      return undefined;
    }

    const index = Number(match[1]);

    if (!Number.isInteger(index)) {
      return undefined;
    }

    return index;
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private charactersForPasswordFormat(): string | undefined {
    switch (this.info.targetPasswordFormat) {
      case "numeric":
        return "0123456789";

      case "alphabetic":
        return "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

      case "alphanumeric":
        return "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

      default:
        return undefined;
    }
  }
}
