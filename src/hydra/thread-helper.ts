import { NS } from "@ns";
import { HYDRA_SCRIPT } from "./types";

export function getMaxPossibleThreads(ns: NS, ip: string, blockedRam: number, script: string): number {
  const controllerRam = ns.getScriptRam(HYDRA_SCRIPT);
  const scriptRam = ns.getScriptRam(script);
  const maxRam = ns.getServerMaxRam(ip) - blockedRam - controllerRam;

  return Math.floor(maxRam / scriptRam);
}
