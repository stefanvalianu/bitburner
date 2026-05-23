import { NS } from "@ns";
import { Codebreaker } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class ZeroLogonCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<boolean> {
    const result = await this.ns.dnet.authenticate(this.target.hostname, "");

    if (!result.success) {
      this.printCoreInfo();
      return false;
    }

    return true;
  }
}
