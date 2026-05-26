import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class BinaryCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const password = this.decodeBinaryPassword(this.info.targetPasswordData);

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
