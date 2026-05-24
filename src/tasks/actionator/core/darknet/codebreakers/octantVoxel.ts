import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class OctantVoxelCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }
  
  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "numeric") {
      const split = this.target.data.split(",");
      if (split.length === 2) {
        const password = this.convertToBase10(Number(split[1]), Number(split[0]))?.toString();

        if (password) {
          const result = await this.ns.dnet.authenticate(this.target.hostname, password);
          
          if (result.success) {
            return { result: "ok", password };
          }
        }
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private convertToBase10(num: number, base: number): number | undefined {
    if (base < 2 || base > 10) {
      return undefined;
    }

    let result = 0;
    let place = 1;
    let remaining = Math.abs(num);

    while (remaining > 0) {
      const digit = remaining % 10;

      if (digit >= base) {
        return undefined;
      }

      result += digit * place;
      place *= base;
      remaining = Math.floor(remaining / 10);
    }

    return num < 0 ? -result : result;
  }
}
