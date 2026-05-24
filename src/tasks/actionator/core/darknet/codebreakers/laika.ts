import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class LaikaCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "alphabetic") {
      if (this.target.passwordLength === 3) {
        const password = "max";
        const result = await this.ns.dnet.authenticate(this.target.hostname, password);
        
        if (result.success) {
          return { result: "ok", password };
        } else if (result.code === 351) {
        return { result: "disconnected" };
      }
      } else if (this.target.passwordLength === 5) {
        const password = "rover";
        const result = await this.ns.dnet.authenticate(this.target.hostname, password);
        
        if (result.success) {
          return { result: "ok", password };
        } else if (result.code === 351) {
        return { result: "disconnected" };
      }
      } else if (this.target.passwordLength === 4) {
        let password = "fido";
        let result = await this.ns.dnet.authenticate(this.target.hostname, password);
        
        if (result.success) {
          return { result: "ok", password };
        } else if (result.code === 351) {
        return { result: "disconnected" };
      }

        password = "spot";
        result = await this.ns.dnet.authenticate(this.target.hostname, password);
        
        if (result.success) {
          return { result: "ok", password };
        } else if (result.code === 351) {
        return { result: "disconnected" };
      }
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}
