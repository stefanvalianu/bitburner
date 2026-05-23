import { NS } from "@ns";
import { Codebreaker } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class PhpCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<boolean> {
    if (this.target.passwordFormat === "numeric") {
      // TODO - broken
      const result = await this.ns.dnet.authenticate(this.target.hostname, this.target.data);
      if (result.success) {
        return true;
      }
    }

    this.printCoreInfo();
    return false;
  }
}
