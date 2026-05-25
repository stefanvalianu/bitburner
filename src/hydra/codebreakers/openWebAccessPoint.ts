import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult, PasswordAttemptLog } from "./codebreaker";

export class OpenWebAccessPointCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    if (this.target.passwordFormat === "numeric") {      
      let password = "123";
      let result = await this.authenticate(password!);
      let maxAttempts = 5;

      // scan the logs for a number matching the required length. if there is more than 1, guess all of them
      while (maxAttempts-- > 0) {
        if (result === null) return { result: "transient" };
        if (result.success) {
          return { result: "ok", password: password! };
        } else {
          /*
            Reminder that multiple different instances of this hydra (on different hosts) could
            be consuming the log.
          */
          const info = await this.ns.dnet.heartbleed(this.targetIp);

          if (info.success && info.logs.length > 0) {
            let logResult: PasswordAttemptLog | undefined;
            
            try {
              logResult = JSON.parse(info.logs[0]) as PasswordAttemptLog;
            } catch {}

            if (logResult && logResult.passwordAttempted && logResult.data) {
              const candidates = this.findNumbersOfLength(logResult.data, this.target.passwordLength);

              for (const candidate of candidates) {
                result = await this.authenticate(candidate);
                if (result === null) return { result: "transient" };
                if (result.success) {
                  return { result: "ok", password: candidate };
                }
              }
            }
            // we probably read some other crappy log, keep trying (stay in the loop)
          } 
          else {
            // some other hydra instance is competing with us for logs, let them get it
            return { result: "transient" };
          }
        }
      }
    }

    this.printCoreInfo();
    return { result: "impossible" };
  }

  private findNumbersOfLength(input: string, length: number): string[] {
    const regex = new RegExp(`(?<!\\d)\\d{${length}}(?!\\d)`, "g");
    return input.match(regex) ?? [];
  }
}
