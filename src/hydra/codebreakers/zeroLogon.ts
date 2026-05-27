import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class ZeroLogonCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const result = await this.authenticate("");
    if (result === "transient") return { result: "transient" };

    if (result === "ok") {
      return { result: "ok", password: "" };
    }

    return { result: "failed" };
  }
}
