import type { NS } from "@ns";
import { clearPorts, KILLSWITCH_PORT } from "./lib/util/ports";
import { App } from "./features/app/App";
import { AppTitle } from "./features/appTitle/AppTitle";

// Do a realtime scan of all servers to be triply sure that
// we run killAll() on every possible server, instead of trusting
// some other component to produce readable state for us.
function killAllScripts(ns: NS): void {
  const visited = new Set<string>();
  const queue = ["home"];
  while (queue.length > 0) {
    const host = queue.shift()!;
    if (visited.has(host)) continue;
    visited.add(host);
    ns.killall(host);
    for (const neighbor of ns.scan(host)) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  ns.exit();
}

export async function main(ns: NS): Promise<void> {
  // Basic setup
  ns.disableLog("ALL");
  ns.clearLog();
  clearPorts(ns);

  // Position the panel 
  ns.ui.openTail();
  const margin = 8; // matches theme.space.md
  const [vpW, vpH] = ns.ui.windowSize();
  const width = Math.floor(vpW / 2) - margin * 2;
  const height = vpH - margin * 2;
  ns.ui.resizeTail(width, height);
  ns.ui.moveTail(vpW - width - margin, margin);
  ns.ui.setTailMinimized(false);

  // When this script is stopped, kill ALL scripts
  ns.atExit(() => killAllScripts(ns));

  // Render react trees
  ns.ui.setTailTitle(<AppTitle ns={ns} />);
  ns.printRaw(<App ns={ns} />);
  
  // Wait until this port is written to
  await ns.nextPortWrite(KILLSWITCH_PORT);
}
