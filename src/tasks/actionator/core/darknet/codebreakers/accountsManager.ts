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
        } else if (result.code === 351) {
          return { result: "disconnected" };
        } else {
          /*
            This is tricky since we are choosing to consume the log, but many different servers could be 
            running this operation (attacks from different sides). This means we really need to use the 
            log as a general re-calibration and update our bounds accordingly. 
          */
          const info = await this.ns.dnet.heartbleed(this.target.hostname);

          if (info.success && info.logs.length > 0) {
            let logResult: PasswordAttemptLog | undefined;
            
            try {
              logResult = JSON.parse(info.logs[0]) as PasswordAttemptLog;
            } catch {}

            if (logResult && logResult.passwordAttempted) {
              const logGuess = Number(logResult.passwordAttempted);
              if (logGuess >= high || logGuess <= low) {
                // This log seems stale, we're already closer to the target. re-generate a log
                result = await this.ns.dnet.authenticate(this.target.hostname, password);
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
              result = await this.ns.dnet.authenticate(this.target.hostname, password);
            }
            // we probably read some other crappy log, keep trying (stay in the loop)
          } 
          else {
            // some other hydra instance is competing with us for logs, let them get it
            return { result: "retry" };
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
