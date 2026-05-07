import type { NS } from "@ns";
import { createLogger } from "./lib/log";
import { scanAll } from "./lib/utils/serverMap";

function fmt(v: string): string {
  if (!v) return "none";
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? new Date(n).toLocaleString() : v;
}

export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  const log = createLogger(ns, "propagate");
  const current = ns.read("version.txt").trim();
  const propagated = ns.read(".state/version.txt").trim();
  if (!current) {
    log.warn("no version.txt; skipping");
    return;
  }
  if (current === propagated) {
    log.info(`already at ${fmt(current)}`);
    return;
  }

  const files = ns.ls("home", ".js");
  log.info(`copying ${files.length} files: ${fmt(propagated)} → ${fmt(current)}`);

  let ok = 0;
  let fail = 0;
  for (const s of scanAll(ns)) {
    if (s.hostname === "home") continue;
    try {
      if (ns.scp(files, s.hostname, "home")) ok++;
      else fail++;
    } catch {
      fail++;
    }
  }
  ns.write(".state/version.txt", current, "w");
  log.info(`done: ${ok} servers updated, ${fail} failed`);
}
