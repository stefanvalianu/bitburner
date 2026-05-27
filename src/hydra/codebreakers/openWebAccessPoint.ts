import { NS } from "@ns";
import { Codebreaker, CodebreakerResult } from "./codebreaker";
import { HydraAuthInfo } from "../types";

type OpenWebAccessPointPasswordFormat = "numeric" | "alphabetic" | "alphanumeric";

export class OpenWebAccessPointCodebreaker extends Codebreaker {
  constructor(target: HydraAuthInfo, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<CodebreakerResult> {
    const passwordFormat = this.info.targetPasswordFormat;

    if (this.isSupportedPasswordFormat(passwordFormat)) {
      let password = "123";
      let result = await this.authenticate(password!);
      let maxAttempts = 10;

      // scan the logs for candidates matching the required length. if there is more than 1, guess all of them
      while (maxAttempts-- > 0) {
        if (result === "transient") return { result: "transient" };
        if (result === "ok") {
          return { result: "ok", password: password! };
        } else {
          /*
            Reminder that multiple different instances of this hydra (on different hosts) could
            be consuming the log.
          */
          const info = await this.getAuthenticateResultLog(password!);

          if (info.result === "transient") {
            // some other hydra instance is competing with us for logs, let them get it
            return { result: "transient" };
          }

          if (info.result === "ok" && info.log) {
            const candidates = this.findPasswordsOfLength(info.log.data, this.info.targetPasswordLength, passwordFormat);

            for (const candidate of candidates) {
              result = await this.authenticate(candidate);
              if (result === "transient") return { result: "transient" };
              if (result === "ok") {
                return { result: "ok", password: candidate };
              }
            }
          }

          // we probably read some other crappy log, keep trying (stay in the loop)
        }
      }
    }

    return { result: "impossible" };
  }

  private isSupportedPasswordFormat(format: string): format is OpenWebAccessPointPasswordFormat {
    return format === "numeric" || format === "alphabetic" || format === "alphanumeric";
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
      const runMatch = match[0];

      for (let i = 0; i <= runMatch.length - length; i++) {
        candidates.add(runMatch.slice(i, i + length));
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
