import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";

export class LaikaCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "alphabetic") {
      if (this.target.passwordLength === 3) {
        const password = "max";
        const result = await this.authenticate(this.target.hostname, password);
        if (result === null) return { result: "transient" };
        
        if (result.success) {
          return { result: "ok", password };
        } 
      } else if (this.target.passwordLength === 5) {
        const password = "rover";
        const result = await this.authenticate(this.target.hostname, password);
        if (result === null) return { result: "transient" };
        
        if (result.success) {
          return { result: "ok", password };
        }
      } else if (this.target.passwordLength === 4) {
        let password = "fido";
        let result = await this.authenticate(this.target.hostname, password);
        if (result === null) return { result: "transient" };
        
        if (result.success) {
          return { result: "ok", password };
        }

        password = "spot";
        result = await this.authenticate(this.target.hostname, password);
        if (result === null) return { result: "transient" };
        
        if (result.success) {
          return { result: "ok", password };
        }
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }
}
