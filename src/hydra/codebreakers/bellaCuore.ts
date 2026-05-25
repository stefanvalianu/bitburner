import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

export class BellaCuoreCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "numeric") {
      const password = this.romanNumeralToNumber(this.target.data).toString();
      const result = await this.authenticate(password);
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password };
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private romanNumeralToNumber(roman: string): number {
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

    for (let i = 0; i < roman.length; i++) {
      const current = values[roman[i]];
      const next = values[roman[i + 1]] ?? 0;

      if (current < next) {
        total -= current;
      } else {
        total += current;
      }
    }

    return total;
  }
}
