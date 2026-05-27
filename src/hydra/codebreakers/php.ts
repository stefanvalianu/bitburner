import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class PhpCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat === "numeric") {
      for (const password of this.getPermutations(this.info.targetPasswordData)) {
        const result = await this.authenticate(password);
        if (result === "transient") return { result: "transient" };
        if (result === "ok") {
          return { result: "ok", password };
        }
      }
    }

    return { result: "impossible" };
  }

  private *getPermutations(value: string): IterableIterator<string> {
    const chars = value.split("");
    yield* this.permute(chars, 0);
  }

  private *permute(chars: string[], index: number): IterableIterator<string> {
    if (index === chars.length) {
      yield chars.join("");
      return;
    }

    const used = new Set<string>();

    for (let i = index; i < chars.length; i++) {
      if (used.has(chars[i])) {
        continue;
      }

      used.add(chars[i]);

      [chars[index], chars[i]] = [chars[i], chars[index]];
      yield* this.permute(chars, index + 1);
      [chars[index], chars[i]] = [chars[i], chars[index]];
    }
  }
}
