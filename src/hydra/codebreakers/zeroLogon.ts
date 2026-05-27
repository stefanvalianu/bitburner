import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class ZeroLogonCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const result = await this.authenticate("");
    if (result === null) return { result: "transient" };

    if (result.success) {
      return { result: "ok", password: "" };
    }

    return { result: "impossible" };
  }
}
