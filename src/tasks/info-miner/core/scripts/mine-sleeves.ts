import { NS } from "@ns";
import { invokeNextScript } from "./helpers";
import { SLEEVE_INFO_PORT } from "@repo/common/ports";
import { SleeveInfo } from "@repo/common/info/sleeveInfo";

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  ns.clearPort(SLEEVE_INFO_PORT);
  ns.writePort(SLEEVE_INFO_PORT, {
  } satisfies SleeveInfo);

  invokeNextScript(ns);
}
