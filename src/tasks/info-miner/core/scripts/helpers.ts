import { NS } from "@ns";

export function invokeNextScript(ns: NS): void {
  if (!ns.args || ns.args.length === 0) return;

  let scripts = JSON.parse(ns.args[0].toString()) as string[];
  const nextScript = scripts.shift();

  if (!nextScript) return;
   
  ns.spawn(nextScript, { spawnDelay: 0, temporary: true }, JSON.stringify(scripts));
}
