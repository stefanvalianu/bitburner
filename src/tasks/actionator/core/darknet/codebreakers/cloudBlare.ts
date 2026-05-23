import { NS } from "@ns";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";
import { Codebreaker } from "./codebreaker";

export class CloudBlareCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }
  
  async tryAuthenticate(): Promise<boolean> {
    if (this.target.passwordFormat === "numeric") {
      const result = await this.ns.dnet.authenticate(this.target.hostname, this.target.data.replace(/\D/g, "").substring(0, this.target.passwordLength));
      if (result.success) {
        return true;
      }
    }

    this.printCoreInfo();
    return false;
  }
}
