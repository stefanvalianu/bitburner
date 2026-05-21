import { NS } from "@ns";
import { INFO_MINER_QUEUE_PORT } from "@repo/common/ports";

export function invokeNextScript(ns: NS): void {
  const nextScript = ns.readPort(INFO_MINER_QUEUE_PORT) as string;

  if (nextScript === "NULL PORT DATA") {
    // this chain of scripts is finished. we write back to the INFO_MINER_QUEUE_PORT to signal completion
    ns.writePort(INFO_MINER_QUEUE_PORT, new Date().getTime());
    return;
  }
   
  // kill the active process and replace it with the next one
  ns.spawn(nextScript, { spawnDelay: 0, temporary: true });
}
