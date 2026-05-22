import { NS } from "@ns";

export interface SourcefileRequirement {
  sourceFile: number;
  level: number;
}

export interface Subscript {
  scriptPath: string;

  /*
    Scripts can repeat at 1 of 3 intervals:
    Fast scripts update at the UX refresh rate
    Slow scripts update at 3x the UX refresh rate
    Scripts that don't repeat only run once.
  */
  repeat: "fast" | "slow" | "none";

  // Optionally define requirements to include this script in the chain
  requirement?: SourcefileRequirement;
}

export function invokeNextScript(ns: NS, queuePort: number): void {
  const nextScript = ns.readPort(queuePort) as string;

  if (nextScript === "NULL PORT DATA") {
    // this chain of scripts is finished.
    return;
  }
   
  // kill the active process and replace it with the next one
  ns.spawn(nextScript, { spawnDelay: 0, temporary: true });
}

export function identifyRunnableSubscripts(ns: NS, subscripts: Subscript[]): Subscript[] {
  const sourceFiles = ns.getResetInfo().ownedSF;

  let scripts: Subscript[] = [];
  
  for (const subscript of subscripts) {
    // figure out which scripts we actually want to run based on source file availability
    if (subscript.requirement) {
      if (!sourceFiles.has(subscript.requirement.sourceFile)) continue;
      if (sourceFiles.get(subscript.requirement.sourceFile)! < subscript.requirement.level) continue;
    }

    scripts.push(subscript);
  }

  return scripts;
}
