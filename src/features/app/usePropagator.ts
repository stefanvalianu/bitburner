import { MutableRefObject, useRef } from "react";
import { useLogger } from "@repo/features/logging/useLogger";
import { useNs } from "@repo/features/ns/NsProvider";
import { GameInfo } from "@repo/common/info/gameInfo";

interface Propagation {
  version: string;
  hosts: Set<string>;
}

/*
  Watches a tracked set of servers and ensures we copy all scripts from 'home'
  onto all potential target servers. This ensures that the right versions of
  all scripts exist on all machines, simplifying script launch expectations.

  This 'hook' re-renders every dashboard interval, but it only needs to propagate
  in 2 cases. On initial launch, and when the list of tracked servers changes.
*/
export function usePropagator(gameInfo: MutableRefObject<GameInfo>): void {
  const ns = useNs();
  const log = useLogger("propagator");

  const propagationRef = useRef<Propagation | null>(null);

  // can't do anything without server info
  if (gameInfo.current.servers === undefined || gameInfo.current.servers.servers.length === 0) return;

  const eligible = gameInfo.current.servers.servers.filter(s => s.name !== "home" && s.hasAdmin).map(s => s.name);
  let targets: string[] = [];
  
  if (propagationRef.current === null) {
    targets = eligible;
  } else {
    targets = eligible.filter(s => !propagationRef.current?.hosts.has(s));
  }

  if (targets.length === 0) return;

  // update the ref to mark all current servers as tracked
  propagationRef.current = {
    version: ns.read("version.txt").trim(),
    hosts: new Set(eligible),
  };

  let ok = 0;
  let fail = 0;
  const files = ns.ls("home", ".js");

  for (const target of targets) {
    try {
      // remove all files from the target
      for (const f of ns.ls(target, ".js")) ns.rm(f, target);

      // copy all files to the target
      if (ns.scp(files, target, "home")) {
        ok++;
        propagationRef.current.hosts.add(target);
      } else {
        fail++;
      }
    } catch {
      fail++;
    }
  }

  log.info(`Done. ${ok} ok, ${fail} failed.`);
}
