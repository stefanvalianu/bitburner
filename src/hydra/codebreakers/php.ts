import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

export class PhpCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "numeric") {
      for (const password of this.getPermutations(this.target.data)) {
        const result = await this.authenticate(password);
        if (result === null) return { result: "transient" };
        if (result.success) {
          return { result: "ok", password };
        }
      }
    }

    this.printCoreInfo();
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
