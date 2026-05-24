import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class FreshInstallCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "alphabetic") {
      const password = this.target.passwordLength === 8 ? "password" : "admin";
      const result = await this.authenticate(this.target.hostname, password);
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password };
      }
    }
    else if (this.target.passwordFormat === "numeric") {
      // either a length of 0s, or an incrementing number
      let password = "0".repeat(this.target.passwordLength);
      let result = await this.authenticate(this.target.hostname, password);
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password };
      }

      password = Array.from({ length: this.target.passwordLength }, (_, i) => i + 1).join("");
      result = await this.authenticate(this.target.hostname, password);
      if (result === null) return { result: "transient" };
      if (result.success) {
        return { result: "ok", password };
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}
