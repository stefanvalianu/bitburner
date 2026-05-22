import { NS } from "@ns";
import { Subscript } from "./types";

export function invokeNextScript(ns: NS, queuePort: number): void {
  const nextScript = ns.readPort(queuePort) as string;

  if (nextScript === "NULL PORT DATA") {
    // this chain of scripts is finished. we write back to the port to signal completion
    ns.writePort(queuePort, Date.now());
    return;
  }
   
  // kill the active process and replace it with the next one
  ns.spawn(nextScript, { spawnDelay: 0, temporary: true });
}

type RunnableSubscripts = {
  oneOffPaths: string[];
  repeatedPaths: string[];
}

export function identifyRunnableSubscripts(ns: NS, subscripts: Subscript[]): RunnableSubscripts {
  const sourceFiles = ns.getResetInfo().ownedSF;

  let oneoffScripts: string[] = [];
  let repeatedScripts: string[] = [];
  
  for (const subscript of subscripts) {
    // figure out which scripts we actually want to run based on source file availability
    if (subscript.requirement) {
      if (!sourceFiles.has(subscript.requirement.sourceFile)) continue;
      if (sourceFiles.get(subscript.requirement.sourceFile)! < subscript.requirement.level) continue;
    }

    subscript.repeated ? 
      repeatedScripts.push(subscript.scriptPath) :
      oneoffScripts.push(subscript.scriptPath);
  }

  return {
    oneOffPaths: oneoffScripts,
    repeatedPaths: repeatedScripts,
  };
}