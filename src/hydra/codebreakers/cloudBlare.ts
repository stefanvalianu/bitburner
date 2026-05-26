import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class CloudBlareCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }
  
  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat === "numeric") {
      const password = this.info.targetPasswordData.replace(/\D/g, "").substring(0, this.info.targetPasswordLength);
      const result = await this.authenticate(password);
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password };
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}
