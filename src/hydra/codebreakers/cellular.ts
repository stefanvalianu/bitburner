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

    if (length <= 0 || characters === undefined) {
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

        if (trysolve.kind === "mismatch" && trysolve.index > index) {
          prefix += char;
          found = true;
          break;
        }
      }

      if (!found) {
        this.printCoreInfo();
        return { result: "impossible" };
      }
    }

    // Usually the final correct character already returns success inside the loop.
    // This is just a defensive final exact trysolve.
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

    // Some wrappers may expose useful auth response details directly.
    const directMismatch = this.parseMismatchIndex(JSON.stringify(result));
    if (directMismatch !== undefined) {
      return { kind: "mismatch", index: directMismatch };
    }

    const bleed = await this.ns.dnet.heartbleed(this.info.targetIp, {
      logsToCapture: 5,
    });

    if (!bleed.success) {
      return { kind: "unknown" };
    }

    for (let i = bleed.logs.length - 1; i >= 0; i--) {
      const mismatch = this.parseMismatchIndex(bleed.logs[i]);
      if (mismatch !== undefined) {
        return { kind: "mismatch", index: mismatch };
      }
    }

    return { kind: "unknown" };
  }

  private parseMismatchIndex(value: string): number | undefined {
    const match = value.match(/Found a mismatch while checking each character \((-?\d+)\)/);
    if (!match) {
      return undefined;
    }

    return Number(match[1]);
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
