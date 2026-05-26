import { DarknetResult, NS } from "@ns";
import { RED, CYAN, RESET, HydraIpPortState, HydraAuthInfo } from "@repo/hydra/types";

export interface PasswordAttemptLog {
  data: string;
  passwordAttempted: string;
}

export interface CodebreakerResult {
  // Transient re-spawns back into a main hydra to potentially re-try.
  // Impossible gets added to the hydra brain's blocklist.
  result: "ok" | "transient" | "impossible";

  password?: string;
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
  protected async authenticate(password: string): Promise<null | DarknetResult & { data?: any; } > {
    const result = await this.ns.dnet.authenticate(this.info.targetIp, password);

    if (result.success) {
      this.ns.clearPort(this.info.targetPort);
      this.ns.writePort(this.info.targetPort, {
        ip: this.info.targetIp,
        state: "infected",
        password: password,
      } satisfies HydraIpPortState);
      
      return result;
    }

    if (result.code === 401) return result;

    // No longer solvable
    if (result.code === 351 ||
        result.code === 503
    ) return null;

    this.ns.tprint(`Failed authenticating to ${this.info.targetIp} with statusCode: ${result.code}`);
    return result;
  }

  protected printCoreInfo(): void {
    this.ns.tprint(`model: ${RED}${this.info.targetModel}${RESET} host: ${CYAN}${this.info.targetIp}${RESET}`);
    this.ns.tprint(`hint: ${CYAN}${this.info.targetPasswordHint}${RESET} data: ${CYAN}${this.info.targetPasswordData}${RESET}`);
    this.ns.tprint(`format: ${CYAN}${this.info.targetPasswordFormat}${RESET} len: ${CYAN}${this.info.targetPasswordLength}${RESET}`);
    this.ns.tprint(`---------------------------------------------------`);
  }
}
