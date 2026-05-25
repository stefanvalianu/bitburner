import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

export class ProverFloCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const password = this.overflowPassword();
    if (password !== undefined) {
      const result = await this.authenticate(password);
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password };
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private overflowPassword(): string | undefined {
    const length = this.target.passwordLength > 0
      ? this.target.passwordLength
      : this.parseBufferLength(this.target.passwordHint);

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
