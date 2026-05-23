import { NS } from "@ns";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";
import { Codebreaker } from "./codebreaker";

export class AccountsManagerCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }
  
  async tryAuthenticate(): Promise<boolean> {
    if (this.target.passwordFormat === "numeric") {
      // guessing a number between X and Y. assume 0 and 10 for now.
      const numbers = this.getExactlyTwoNumbers(this.target.passwordHint);

      if (numbers === undefined) {
        this.printCoreInfo();
        return false;
      }

      let low = numbers[0];
      let high = numbers[1];
      let guess = (low + high) / 2;

      this.ns.tprint(`${this.target.hostname}: searching between ${low} and ${high}, guess: ${guess}`);

      const result = await this.ns.dnet.authenticate(this.target.hostname, guess.toString());

      if (result.success) {
        return true;
      } else {
        this.ns.tprint(`result: ${JSON.stringify(result)}`);

        try {
          const info = await this.ns.dnet.heartbleed(this.target.hostname);
          this.ns.tprint(`heartbleedw: ${JSON.stringify(info)}`);
        } catch (e: any) {
          this.ns.tprint(`error: ${JSON.stringify(e)}`);
        }
      }
    }

    this.printCoreInfo();
    return false;
  }

  private getExactlyTwoNumbers(input: string): [number, number] | undefined {
    const match = input.match(/^\D*(\d+)\D+(\d+)\D*$/);

    if (!match) return undefined;

    return [Number(match[1]), Number(match[2])];
  }
}
