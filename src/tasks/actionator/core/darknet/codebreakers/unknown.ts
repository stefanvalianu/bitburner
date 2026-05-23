import { NS } from "@ns";
import { Codebreaker } from "./codebreaker";
import { DarknetServer, RED, RESET } from "@repo/tasks/actionator/core/darknet/types";

export class UnknownCodebreaker extends Codebreaker {
  constructor(target: DarknetServer, ns: NS) { super(target, ns); }

  async tryAuthenticate(): Promise<boolean> {
    this.ns.tprint(`---- ${RED}UNKNOWN${RESET} ----`);
    this.printCoreInfo();
  
    return false;
  }
}
