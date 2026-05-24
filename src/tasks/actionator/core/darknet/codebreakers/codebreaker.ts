import { DarknetResult, NS } from "@ns";
import { CYAN, DarknetServer, RED, RESET } from "@repo/tasks/actionator/core/darknet/types";

export interface CodebreakerResult {
  // Transient re-spawns back into a main hydra to potentially re-try.
  // Impossible gets added to the hydra brain's blocklist.
  result: "ok" | "transient" | "impossible";

  password?: string;
};

export abstract class Codebreaker {
  protected readonly ns: NS;
  protected readonly target: DarknetServer;

  constructor(target: DarknetServer, ns: NS) {
    this.ns = ns;
    this.target = target;
  }

  abstract tryAuthenticate(): Promise<CodebreakerResult>;

  // Returns null if the status code indicates further authentications are pointless
  protected async authenticate(target: string, password: string): Promise<null | DarknetResult & { data?: any; } > {
    const result = await this.ns.dnet.authenticate(target, password);

    if (!result.success) {
      this.ns.tprint(`Failed authenticating to ${this.target.hostname} with statusCode: ${result.code}`);
    }

    if (result.code === 351) return null;

    return result;
  }

  protected printCoreInfo(): void {
    this.ns.tprint(`model: ${RED}${this.target.modelId}${RESET} host: ${CYAN}${this.target.hostname}${RESET}`);
    this.ns.tprint(`hint: ${CYAN}${this.target.passwordHint}${RESET} data: ${CYAN}${this.target.data}${RESET}`);
    this.ns.tprint(`format: ${CYAN}${this.target.passwordFormat}${RESET} len: ${CYAN}${this.target.passwordLength}${RESET}`);
    this.ns.tprint(`---------------------------------------------------`);
  }
}
