import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

export class LaikaCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "alphabetic") {
      if (this.target.passwordLength === 3) {
        const password = "max";
        const result = await this.authenticate(password);
        if (result === null) return { result: "transient" };
        
        if (result.success) {
          return { result: "ok", password };
        } 
      } else if (this.target.passwordLength === 5) {
        const password = "rover";
        const result = await this.authenticate(password);
        if (result === null) return { result: "transient" };
        
        if (result.success) {
          return { result: "ok", password };
        }
      } else if (this.target.passwordLength === 4) {
        let password = "fido";
        let result = await this.authenticate(password);
        if (result === null) return { result: "transient" };
        
        if (result.success) {
          return { result: "ok", password };
        }

        password = "spot";
        result = await this.authenticate(password);
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
