import { NS } from "@ns";
import { Codebreaker, CodebreakerResult, PasswordAttemptLog } from "./codebreaker";
import { HydraAuthInfo } from "../types";

export class AccountsManagerCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }
  
  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.info.targetPasswordFormat === "numeric") {
      // guessing a number between X and Y.
      const numbers = this.getExactlyTwoNumbers(this.info.targetPasswordHint);

      if (numbers === undefined) {
        return { result: "failed" };
      }

      let low = numbers[0];
      let high = numbers[1];
      let guess = Math.floor((low + high) / 2);
      let password = guess.toString();

      let result = await this.authenticate(password);

      // binary search our way to the number
      while (low !== high) {
        if (result === "transient") return { result: "transient" }
        if (result === "ok") {
          return { result: "ok", password };
        } else {
          const info = await this.getAuthenticateResultLog(password);

          if (info.result === "ok") {

          } else {
            this.ns.tprint(`Failed to find logs solving ${this.info.targetModel}`)
          }
          
          const info = await this.ns.dnet.heartbleed(this.info.targetIp);

          if (info.success && info.logs.length > 0) {
            let logResult: PasswordAttemptLog | undefined;
            
            try {
              logResult = JSON.parse(info.logs[0]) as PasswordAttemptLog;
            } catch {}

            if (logResult && logResult.passwordAttempted && logResult.data) {
              const logGuess = Number(logResult.passwordAttempted);
              if (logGuess >= high || logGuess <= low) {
                // This log seems stale, we're already closer to the target. re-generate a log
                result = await this.authenticate(password);
                continue;
              }

              guess = logGuess;

              if (logResult.data.toLowerCase() === "lower") {
                high = guess;
              } else {
                low = guess;
              }

              guess = Math.floor((low + high) / 2);
              password = guess.toString();
              result = await this.authenticate(password);
            }
          }
        }
      }
    }

    return { result: "impossible" };
  }

  private getExactlyTwoNumbers(input: string): [number, number] | undefined {
    const match = input.match(/^\D*(\d+)\D+(\d+)\D*$/);

    if (!match) return undefined;

    return [Number(match[1]), Number(match[2])];
  }
}
