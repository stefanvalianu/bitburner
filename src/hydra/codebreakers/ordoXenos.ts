import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class OrdoXenosCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const password = this.decryptPassword(this.info.targetPasswordData);

    if (password !== undefined) {
      const result = await this.authenticate(password);

      if (result === "transient") return { result: "transient" };
      if (result === "ok") return { result: "ok", password };
    }

    return { result: "impossible" };
  }

  private decryptPassword(data: string): string | undefined {
    const split = data.split(";");
    if (split.length !== 2) {
      return undefined;
    }

    const source = split[0];
    const bitmasks = split[1].trim().split(" ");

    if (source.length !== bitmasks.length) {
      return undefined;
    }

    let password = "";

    for (let i = 0; i < source.length; i++) {
      const mask = this.parseBitmask(bitmasks[i]);
      if (mask === undefined) {
        return undefined;
      }

      password += String.fromCharCode(source.charCodeAt(i) ^ mask);
    }

    return password;
  }

  private parseBitmask(bitmask: string): number | undefined {
    if (!/^[01]{8}$/.test(bitmask)) {
      return undefined;
    }

    return parseInt(bitmask, 2);
  }
}
