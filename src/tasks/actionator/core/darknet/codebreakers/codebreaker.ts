import { NS } from "@ns";
import { CYAN, DarknetServer, RED, RESET } from "@repo/tasks/actionator/core/darknet/types";

export interface CodebreakerResult {
  result: "ok" | "insufficient_data" | "impossible";

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

  protected printCoreInfo(): void {
    this.ns.tprint(`model: ${RED}${this.target.modelId}${RESET} host: ${CYAN}${this.target.hostname}${RESET}`);
    this.ns.tprint(`hint: ${CYAN}${this.target.passwordHint}${RESET} data: ${CYAN}${this.target.data}${RESET}`);
    this.ns.tprint(`format: ${CYAN}${this.target.passwordFormat}${RESET} len: ${CYAN}${this.target.passwordLength}${RESET}`);
    this.ns.tprint(`---------------------------------------------------`);
  }
}
