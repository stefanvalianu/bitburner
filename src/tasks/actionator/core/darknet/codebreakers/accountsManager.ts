import { NS } from "@ns";
import { DarknetServer } from "@repo/tasks/actionator/core/darknet/types";
import { Codebreaker, CodebreakerResult } from "./codebreaker";

interface PasswordAttemptLog {
  data: string;
  passwordAttempted: string;
}

export class AccountsManagerCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }
  
  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "numeric") {
      // guessing a number between X and Y.
      const numbers = this.getExactlyTwoNumbers(this.target.passwordHint);

      if (numbers === undefined) {
        this.printCoreInfo();
        return { result: "impossible" };
      }

      let low = numbers[0];
      let high = numbers[1];
      let guess = Math.floor((low + high) / 2);
      let password = guess.toString();

      let result = await this.ns.dnet.authenticate(this.target.hostname, password);

      // binary search our way to the number
      while (low !== high) {
        if (result.success) {
          return { result: "ok", password };
        } else {
          const info = await this.ns.dnet.heartbleed(this.target.hostname);

          if (info.success && info.logs.length > 0) {
            const logResult = JSON.parse(info.logs[0]) as PasswordAttemptLog;

            if (logResult && logResult.passwordAttempted) {
              if (logResult.passwordAttempted === password) {
                // this is the right log
                if (logResult.data.toLowerCase() === "lower") {
                  high = guess;
                } else {
                  low = guess;
                }

                guess = Math.floor((low + high) / 2);
                password = guess.toString();
                result = await this.ns.dnet.authenticate(this.target.hostname, password);
              }
            }

            // we probably read some other crappy log, keep trying (stay in the loop)
          } 
          else {
            break;
          }
        }
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private getExactlyTwoNumbers(input: string): [number, number] | undefined {
    const match = input.match(/^\D*(\d+)\D+(\d+)\D*$/);

    if (!match) return undefined;

    return [Number(match[1]), Number(match[2])];
  }
}
