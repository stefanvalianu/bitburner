import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class FreshInstallCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "alphabetic") {
      const password = this.target.passwordLength === 8 ? "password" : "admin";
      const result = await this.ns.dnet.authenticate(this.target.hostname, password);
      if (result.success) {
        return { result: "ok", password };
      } else if (result.code === 351) {
        return { result: "disconnected" };
      }
    }
    else if (this.target.passwordFormat === "numeric") {
      // either a length of 0s, or an incrementing number
      let password = "0".repeat(this.target.passwordLength);
      let result = await this.ns.dnet.authenticate(this.target.hostname, password);
      if (result.success) {
        return { result: "ok", password };
      } else if (result.code === 351) {
        return { result: "disconnected" };
      }

      password = Array.from({ length: this.target.passwordLength }, (_, i) => i + 1).join("");
      result = await this.ns.dnet.authenticate(this.target.hostname, password);
      if (result.success) {
        return { result: "ok", password };
      } else if (result.code === 351) {
        return { result: "disconnected" };
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}
