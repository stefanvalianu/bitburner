import { NS } from "@ns";
import { Codebreaker } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class DeskMemoCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<boolean> {
    if (this.target.passwordFormat === "numeric") {
      const result = await this.ns.dnet.authenticate(this.target.hostname, this.target.passwordHint.replace(/\D/g, "").substring(0, this.target.passwordLength));
      if (result.success) {
        return true;
      }
    }

    this.printCoreInfo();
    return false;
  }
}
