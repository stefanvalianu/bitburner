import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

export class ZeroLogonCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const result = await this.authenticate("");
    if (result === null) return { result: "transient" };

    if (result.success) {
      return { result: "ok", password: "" };
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}
