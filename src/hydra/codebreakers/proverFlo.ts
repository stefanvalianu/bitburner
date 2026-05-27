import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class ProverFloCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const password = this.overflowPassword();
    if (password !== undefined) {
      const result = await this.authenticate(password);
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password };
      }
    }

    return { result: "impossible" };
  }

  private overflowPassword(): string | undefined {
    const length = this.info.targetPasswordLength > 0
      ? this.info.targetPasswordLength
      : this.parseBufferLength(this.info.targetPasswordHint);

    if (length === undefined || length <= 0) {
      return undefined;
    }

    return "0".repeat(length * 2);
  }

  private parseBufferLength(hint: string): number | undefined {
    const match = hint.match(/\b(\d+)\s*bytes?\b/i);
    if (!match) {
      return undefined;
    }

    return Number(match[1]);
  }
}
