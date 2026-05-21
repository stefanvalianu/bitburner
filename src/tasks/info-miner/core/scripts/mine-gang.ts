import { NS } from "@ns";
import { invokeNextScript } from "./helpers";
import { GANG_INFO_PORT } from "@repo/common/ports";
import { GangInfo } from "@repo/common/info/gangInfo";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  ns.clearPort(GANG_INFO_PORT);
  ns.writePort(GANG_INFO_PORT, {
  } satisfies GangInfo);

  invokeNextScript(ns);
}
