import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class LaikaCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat === "alphabetic") {
      if (this.info.targetPasswordLength === 3) {
        const password = "max";
        const result = await this.authenticate(password);
        if (result === "transient") return { result: "transient" };
        
        if (result === "ok") {
          return { result: "ok", password };
        } 
      } else if (this.info.targetPasswordLength === 5) {
        const password = "rover";
        const result = await this.authenticate(password);
        if (result === "transient") return { result: "transient" };
        
        if (result === "ok") {
          return { result: "ok", password };
        }
      } else if (this.info.targetPasswordLength === 4) {
        let password = "fido";
        let result = await this.authenticate(password);
        if (result === "transient") return { result: "transient" };
        
        if (result === "ok") {
          return { result: "ok", password };
        }

        password = "spot";
        result = await this.authenticate(password);
        if (result === "transient") return { result: "transient" };
        
        if (result === "ok") {
          return { result: "ok", password };
        }
      }
    }

    return { result: "failed" };
  }
}
