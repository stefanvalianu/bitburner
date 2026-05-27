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
        return { result: "impossible" };
      }
    }

    const result = await this.authenticate(prefix);
    if (result === "transient") return { result: "transient" };
    if (result === "ok") return { result: "ok", password: prefix };

    return { result: "impossible" };
  }

  private async tryPasswordAndReadMismatch(password: string): Promise<TimingTrySolveResult> {
    const result = await this.authenticate(password);

    if (result === "transient") {
      return { kind: "transient" };
    }

    if (result === "ok") {
      return { kind: "success", password };
    }

    const info = await this.getAuthenticateResultLog(password);

    if (info.result === "transient") {
      return { kind: "transient" };
    }

    if (info.result !== "ok" || !info.log || typeof info.log.message !== "string") {
      return { kind: "unknown" };
    }

    const mismatch = this.parseMismatchIndex(info.log.message);

    if (mismatch !== undefined) {
      return { kind: "mismatch", index: mismatch };
    }

    return { kind: "unknown" };
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
