import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class FreshInstallCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat === "alphabetic") {
      const password = this.info.targetPasswordLength === 8 ? "password" : "admin";
      const result = await this.authenticate(password);
      if (result === "transient") return { result: "transient" };
      if (result === "ok") {
        return { result: "ok", password };
      }
    }
    else if (this.info.targetPasswordFormat === "numeric") {
      // either a length of 0s, or an incrementing number
      let password = "0".repeat(this.info.targetPasswordLength);
      let result = await this.authenticate(password);
      if (result === "transient") return { result: "transient" };
      if (result === "ok") {
        return { result: "ok", password };
      }

      password = Array.from({ length: this.info.targetPasswordLength }, (_, i) => i + 1).join("");
      result = await this.authenticate(password);
      if (result === "transient") return { result: "transient" };
      if (result === "ok") {
        return { result: "ok", password };
      }
    }

    return { result: "failed" };
  }
}
