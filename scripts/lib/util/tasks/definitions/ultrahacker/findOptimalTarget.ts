import { NS } from "@ns";
import { performAnalysis } from "../noform-hacker/profitAnalysis";
import { ServerInfo } from "../../../dashboardTypes";

export function findOptimalTarget(ns: NS, allServers: ServerInfo[]): string {
  // todo

  // hack chance (probably want this in the targetting calculation)
  //this.ns.formulas.hacking.hackChance()

  return performAnalysis(ns, allServers).analysis[0].hostname;
}
