import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class OctantVoxelCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) {
    super(target, ns);
  }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat !== "numeric") {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const parts = this.target.data.split(",");
    if (parts.length !== 2) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    const base = Number(parts[0].trim());
    const encodedValue = parts[1].trim();

    const password = this.convertToBase10String(encodedValue, base);

    // Important: "0" is a valid password, so do not use `if (password)`
    if (password !== undefined) {
      const result = await this.ns.dnet.authenticate(this.target.hostname, password);

      if (result.success) {
        return { result: "ok", password };
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private convertToBase10String(value: string, base: number): string | undefined {
    if (!Number.isInteger(base) || base < 2 || base > 36) {
      return undefined;
    }

    if (value.length === 0) {
      return undefined;
    }

    let sign = 1n;
    let start = 0;

    if (value[0] === "-") {
      sign = -1n;
      start = 1;
    }

    if (start >= value.length) {
      return undefined;
    }

    let result = 0n;
    const bigBase = BigInt(base);

    for (let i = start; i < value.length; i++) {
      const digit = this.getDigitValue(value[i]);

      if (digit === undefined || digit >= base) {
        return undefined;
      }

      result = result * bigBase + BigInt(digit);
    }

    return (result * sign).toString();
  }

  private getDigitValue(char: string): number | undefined {
    const code = char.toUpperCase().charCodeAt(0);

    // 0-9
    if (code >= 48 && code <= 57) {
      return code - 48;
    }

    // A-Z
    if (code >= 65 && code <= 90) {
      return code - 65 + 10;
    }

    return undefined;
  }
}
