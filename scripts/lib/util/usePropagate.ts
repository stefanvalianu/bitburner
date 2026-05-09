import { useEffect } from "react";
import { useDashboardController } from "./useDashboardController";
import { useLogger } from "./logging/log";
import { useNs } from "./ns";

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
  const { state } = useDashboardController();

  useEffect(() => {
    if (!state.currentVersion) return;
    if (state.currentVersion === state.propagatedVersion) return;

    const files = ns.ls("home", ".js");
    log.info(
      `propagating ${files.length} files: ${fmt(state.propagatedVersion)} → ${fmt(state.currentVersion)}`,
    );

    let ok = 0;
    let fail = 0;
    for (const server of state.allServers) {
      if (server.hostname === "home") continue;
      try {
        // first, clear all existing scripts on the machine
        const existingFiles = ns.ls(server.hostname, ".js");
        for (const existingFile of existingFiles) {
          // jesus, this costs 1gb of ram.. might be better to leave old files polluting the machine
          ns.rm(existingFile, server.hostname);
        }

        if (ns.scp(files, server.hostname, "home")) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    ns.write(".state/version.txt", state.currentVersion, "w");
    log.info(`done: ${ok} ok, ${fail} failed`);
  }, [ns, log, state.currentVersion, state.propagatedVersion]);
}
