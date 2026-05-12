import { useEffect, useRef } from "react";
import { useDashboardController } from "./useDashboardController";
import { useLogger } from "./logging/log";
import { useNs } from "./ns";

function fmt(v: string): string {
  if (!v) return "none";
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? new Date(n).toLocaleString() : v;
}

// Distributes home's *.js files to every reachable server we have admin on.
// Two trigger paths share one effect:
//   1. Build bump (version.txt !== .state/version.txt) — wipe + re-scp every
//      eligible host to clear stale scripts, then stamp .state/version.txt.
//   2. New eligible host appears (just nuked by ServerPanel, or just bought
//      by the server-buyer task) — scp without wiping, since the host is
//      fresh and ns.rm costs 1GB per call.
// A ref tracks which hosts have received the current version so the common
// per-tick path early-returns once everything is in sync.
export function usePropagate(): void {
  const ns = useNs();
  const log = useLogger("propagate");
  const { state } = useDashboardController();

  const propagatedRef = useRef<{ version: string; hosts: Set<string> } | null>(null);

  useEffect(() => {
    if (!state.currentVersion) return;

    const eligible = state.allServers.filter(
      (s) => s.hostname !== "home" && s.hasAdminRights,
    );
    const versionChanged = state.currentVersion !== state.propagatedVersion;

    // On the very first tick, trust .state/version.txt: if disk says we're
    // already current, mark every currently-visible eligible host as done so
    // a dashboard relaunch doesn't redundantly re-scp every server.
    if (propagatedRef.current === null) {
      propagatedRef.current = {
        version: state.currentVersion,
        hosts: versionChanged ? new Set() : new Set(eligible.map((s) => s.hostname)),
      };
    } else if (propagatedRef.current.version !== state.currentVersion) {
      // Mid-session build bump: forget what we propagated, force a full sweep.
      propagatedRef.current = { version: state.currentVersion, hosts: new Set() };
    }

    const tracked = propagatedRef.current;
    const targets = eligible.filter((s) => !tracked.hosts.has(s.hostname));
    if (targets.length === 0) return;

    const files = ns.ls("home", ".js");
    log.info(
      `propagating ${files.length} files to ${targets.length} server(s)` +
        (versionChanged ? ` (${fmt(state.propagatedVersion)} → ${fmt(state.currentVersion)})` : ""),
    );

    let ok = 0;
    let fail = 0;
    for (const server of targets) {
      try {
        if (versionChanged) {
          // jesus, this costs 1gb of ram.. only paid on build bumps now
          for (const f of ns.ls(server.hostname, ".js")) ns.rm(f, server.hostname);
        }
        if (ns.scp(files, server.hostname, "home")) {
          ok++;
          tracked.hosts.add(server.hostname);
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
    }

    // Stamp disk only once every currently-eligible host has the new build.
    if (versionChanged && eligible.every((s) => tracked.hosts.has(s.hostname))) {
      ns.write(".state/version.txt", state.currentVersion, "w");
    }
    log.info(`done: ${ok} ok, ${fail} failed`);
  }, [ns, log, state.currentVersion, state.propagatedVersion, state.allServers]);
}
