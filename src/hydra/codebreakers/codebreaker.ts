import { DarknetResult, DarknetServerDetails, NS } from "@ns";
import { RED, CYAN, RESET, HydraIpPortState } from "@repo/hydra/types";
import { ipv4ToUint32Fast } from "../helpers";

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
  protected readonly target: DarknetServerDetails;
  protected readonly targetIp: string;

  constructor(target: DarknetServerDetails, ip: string, ns: NS) {
    this.ns = ns;
    this.target = target;
    this.targetIp = ip;
  }

  abstract tryAuthenticate(): Promise<CodebreakerResult>;

  // Returns null if the status code indicates further authentications are pointless
  protected async authenticate(password: string): Promise<null | DarknetResult & { data?: any; } > {
    const result = await this.ns.dnet.authenticate(this.targetIp, password);

    if (result.success) {
      const port = ipv4ToUint32Fast(this.targetIp);
      this.ns.clearPort(port);
      this.ns.writePort(port, {
        ip: this.targetIp,
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

    this.ns.tprint(`Failed authenticating to ${this.targetIp} with statusCode: ${result.code}`);
    return result;
  }

  protected printCoreInfo(): void {
    this.ns.tprint(`model: ${RED}${this.target.modelId}${RESET} host: ${CYAN}${this.targetIp}${RESET}`);
    this.ns.tprint(`hint: ${CYAN}${this.target.passwordHint}${RESET} data: ${CYAN}${this.target.data}${RESET}`);
    this.ns.tprint(`format: ${CYAN}${this.target.passwordFormat}${RESET} len: ${CYAN}${this.target.passwordLength}${RESET}`);
    this.ns.tprint(`---------------------------------------------------`);
  }
}
