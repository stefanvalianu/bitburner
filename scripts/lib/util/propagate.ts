import { useEffect } from "react";
import { useGameState } from "./gameState";
import { useLogger } from "./logging/log";
import { useNs } from "./ns";
import { scanAll } from "./serverMap";

function fmt(v: string): string {
  if (!v) return "none";
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? new Date(n).toLocaleString() : v;
}

// Watches version.txt vs .state/version.txt (both surfaced by GameStateProvider)
// and scp's every *.js from home to every reachable server when they diverge.
// Lives in the dashboard tree rather than a spawned script so we reuse the
// scanAll RAM already paid by the gameState snapshot — no extra process.
export function usePropagate(): void {
  const ns = useNs();
  const log = useLogger("propagate");
  const { currentVersion, propagatedVersion } = useGameState();

  useEffect(() => {
    if (!currentVersion) return;
    if (currentVersion === propagatedVersion) return;

    const files = ns.ls("home", ".js");
    log.info(
      `propagating ${files.length} files: ${fmt(propagatedVersion)} → ${fmt(currentVersion)}`,
    );

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
    ns.write(".state/version.txt", currentVersion, "w");
    log.info(`done: ${ok} ok, ${fail} failed`);
  }, [ns, log, currentVersion, propagatedVersion]);
}
