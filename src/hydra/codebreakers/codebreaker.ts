import { NS } from "@ns";
import { HydraIpPortState, HydraAuthInfo } from "@repo/hydra/types";

type Result = "ok" | "failed" | "transient" | "impossible";

export interface PasswordAttemptLog {
  data: string;
  passwordAttempted: string;
  message?: string;
}

export interface LogResult {
  log?: PasswordAttemptLog;
  result: Result;
}

export interface CodebreakerResult {
  password?: string;
  result: Result;
};

export abstract class Codebreaker {
  protected readonly ns: NS;
  protected readonly info: HydraAuthInfo

  constructor(info: HydraAuthInfo, ns: NS) {
    this.ns = ns;
    this.info = info;
  }

  abstract tryAuthenticate(): Promise<CodebreakerResult>;

  // Returns null if the status code indicates further authentications are pointless
  protected async authenticate(password: string): Promise<Result> {
    const result = await this.ns.dnet.authenticate(this.info.targetIp, password);

    if (result.success) {
      this.ns.clearPort(this.info.targetPort);
      this.ns.writePort(this.info.targetPort, {
        ip: this.info.targetIp,
        state: "infected",
        password: password,
      } satisfies HydraIpPortState);
      
      return "ok";
    }

    if (result.code === 401 ||
        result.code === 403
    ) return "failed";

    // No longer solvable
    if (result.code === 351 ||
        result.code === 503
    ) return "transient";

    this.ns.tprint(`Failed authenticating to ${this.info.targetIp} with statusCode: ${result.code}`);
    return "failed";
  }

  // Used to run heartbleed() and retrieve the log
  protected async getAuthenticateResultLog(attemptedPassword: string): Promise<LogResult> {
    const info = await this.ns.dnet.heartbleed(this.info.targetIp, {
      logsToCapture: 50,
      peek: true,
    });

    if (!info.success) {
      // requests can fail because servers go offline, move, etc.
      return { result: (info.code === 401 || info.code === 403) ? "failed" : "transient" };
    }

    for (const log of info.logs) {
      const candidates: unknown[] = [];

      try {
        const outer = JSON.parse(log);
        candidates.push(outer);

        if (outer && typeof outer === "object") {
          const message = (outer as { message?: unknown }).message;

          if (typeof message === "string") {
            try {
              candidates.push(JSON.parse(message));
            } catch {}
          } else if (message !== undefined) {
            candidates.push(message);
          }
        }
      } catch {}

      for (const candidate of candidates) {
        if (candidate && typeof candidate === "object") {
          const json = candidate as PasswordAttemptLog;
          if (json.passwordAttempted === attemptedPassword) {
            return {
              result: "ok",
              log: json
            }
          }
        }
      }
    }

    this.ns.tprint(`Failed to find logs solving ${this.info.targetModel}`);
    return { result: "failed" };
  }
}
