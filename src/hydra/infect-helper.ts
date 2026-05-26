import { NS } from "@ns";
import { getPortData, SCP_FILES_PORT } from "@repo/common/ports";
import { HYDRA_SCRIPT } from "./types";

export function spawnHydra(ns: NS, targetIp: string): void {
  // Spread files and start the hydra
  const files = getPortData<string[]>(ns, SCP_FILES_PORT);
  
  if (!files) {
    throw new Error(`Failed to retrieve files to propagate from port ${SCP_FILES_PORT}`);
  }
  
  ns.scp(files, targetIp, "home");
  ns.exec(HYDRA_SCRIPT, targetIp, { temporary: false, preventDuplicates: true });
}
