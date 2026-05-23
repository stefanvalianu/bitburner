import { NS } from "@ns";
import { Codebreaker } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class FreshInstallCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<boolean> {
    if (this.target.passwordFormat === "alphabetic") {
      const password = this.target.passwordLength === 8 ? "password" : "admin";
      const result = await this.ns.dnet.authenticate(this.target.hostname, password);
      if (result.success) {
        return true;
      }
    }
    else if (this.target.passwordFormat === "numeric") {
      // either a length of 0s, or an incrementing number
      let guess = "0".repeat(this.target.passwordLength);
      let result = await this.ns.dnet.authenticate(this.target.hostname, guess);
      if (result.success) {
        return true;
      }

      guess = Array.from({ length: this.target.passwordLength }, (_, i) => i + 1).join("");
      result = await this.ns.dnet.authenticate(this.target.hostname, guess);
      if (result.success) {
        return true;
      }
    }

    this.printCoreInfo();
    return false;
  }
}
