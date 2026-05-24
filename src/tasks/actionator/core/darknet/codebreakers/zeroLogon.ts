import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class ZeroLogonCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const result = await this.ns.dnet.authenticate(this.target.hostname, "");

    if (!result.success) {
      this.printCoreInfo();
      return { result: "impossible" };
    }

    return { result: "ok", password: "" };
  }
}
