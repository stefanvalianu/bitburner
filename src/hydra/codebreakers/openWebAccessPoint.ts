import { DarknetServerDetails, NS } from "@ns";
import { Codebreaker, CodebreakerResult, PasswordAttemptLog } from "./codebreaker";

type OpenWebAccessPointPasswordFormat = "numeric" | "alphabetic" | "alphanumeric";

export class OpenWebAccessPointCodebreaker extends Codebreaker {
  constructor(target: DarknetServerDetails, ip: string, ns: NS) { super(target, ip, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const passwordFormat = this.target.passwordFormat;

    if (this.isSupportedPasswordFormat(passwordFormat)) {      
      let password = "123";
      let result = await this.authenticate(password!);
      let maxAttempts = 10;

      // scan the logs for candidates matching the required length. if there is more than 1, guess all of them
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
            for (const log of info.logs) {
              const logResult = this.parsePasswordAttemptLog(log);

              if (logResult && logResult.passwordAttempted && logResult.data) {
                const candidates = this.findPasswordsOfLength(logResult.data, this.target.passwordLength, passwordFormat);

                for (const candidate of candidates) {
                  result = await this.authenticate(candidate);
                  if (result === null) return { result: "transient" };
                  if (result.success) {
                    return { result: "ok", password: candidate };
                  }
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

  private isSupportedPasswordFormat(format: string): format is OpenWebAccessPointPasswordFormat {
    return format === "numeric" || format === "alphabetic" || format === "alphanumeric";
  }

  private parsePasswordAttemptLog(input: string): PasswordAttemptLog | undefined {
    let parsed: unknown;

    try {
      parsed = JSON.parse(input);
    } catch {
      return undefined;
    }

    if (this.isPasswordAttemptLog(parsed)) {
      return parsed;
    }

    /*
      Some source paths wrap the password response in a log object.
      Keep supporting the direct shape too, since that is what older/current scripts may already see.
    */
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const wrapped = parsed as { message?: unknown };

      if (this.isPasswordAttemptLog(wrapped.message)) {
        return wrapped.message;
      }
    }

    return undefined;
  }

  private isPasswordAttemptLog(input: unknown): input is PasswordAttemptLog {
    return (
      input !== null &&
      typeof input === "object" &&
      "passwordAttempted" in input &&
      "data" in input &&
      typeof (input as PasswordAttemptLog).passwordAttempted === "string" &&
      typeof (input as PasswordAttemptLog).data === "string"
    );
  }

  private findPasswordsOfLength(input: string, length: number, format: OpenWebAccessPointPasswordFormat): string[] {
    if (length <= 0) return [];

    const characters = this.getCharactersForFormat(format);
    const candidates = new Set<string>();

    /*
      Prefer clean bounded candidates first. This handles the easier packet format where
      the real password appears as hostname:password with separators around it.
    */
    const boundedRegex = new RegExp(`(?<![${characters}])[${characters}]{${length}}(?![${characters}])`, "g");
    for (const candidate of input.match(boundedRegex) ?? []) {
      candidates.add(candidate);
    }

    /*
      Higher difficulties can embed the password directly inside random alphanumeric data.
      In that case there may be no non-matching boundary, so scan every valid run.
    */
    const runRegex = new RegExp(`[${characters}]{${length},}`, "g");
    for (const match of input.matchAll(runRegex)) {
      const run = match[0];

      for (let i = 0; i <= run.length - length; i++) {
        candidates.add(run.slice(i, i + length));
      }
    }

    return [...candidates];
  }

  private getCharactersForFormat(format: OpenWebAccessPointPasswordFormat): string {
    switch (format) {
      case "numeric":
        return "0-9";
      case "alphabetic":
        return "A-Za-z";
      case "alphanumeric":
        return "0-9A-Za-z";
    }
  }
}
