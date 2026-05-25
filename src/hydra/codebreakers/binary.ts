import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

export class BinaryCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const password = this.decodeBinaryPassword(this.target.data);

    if (password) {
      const result = await this.authenticate(password);

      if (result === null) return { result: "transient" };
      if (result.success) return { result: "ok", password };
    } 

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private decodeBinaryPassword(data: string): string | null {
    const chunks = data.trim().split(/\s+/);

    if (chunks.length === 0) {
      return null;
    }

    let password = "";

    for (const chunk of chunks) {
      if (!/^[01]{8}$/.test(chunk)) {
        return null;
      }

      password += String.fromCharCode(parseInt(chunk, 2));
    }

    return password;
  }
}
