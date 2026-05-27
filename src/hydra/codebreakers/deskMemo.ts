import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class DeskMemoCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat === "numeric") {
      const password = this.info.targetPasswordHint.replace(/\D/g, "").substring(0, this.info.targetPasswordLength);
      const result = await this.authenticate(password);
      if (result === "transient") return { result: "transient" };
      if (result === "ok") {
        return { result: "ok", password };
      }
    }

    return { result: "impossible" };
  }
}
