import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

export class OrdoXenosCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const source = this.target.data.substring(0, this.target.passwordLength);
    const bitmasks = this.target.data.substring(this.target.passwordLength).split(" ");

    let password: string = "";

    for (let i = 0; i < this.target.passwordLength; i++) {
      password += String.fromCharCode(source.charCodeAt(i) ^ parseInt(bitmasks[i]));
    }
    
    if (password) {
      const result = await this.authenticate(password);

      if (result === null) return { result: "transient" };
      if (result.success) return { result: "ok", password };
    } 
    
    this.printCoreInfo();
    return { result: "impossible" };
  }
}
