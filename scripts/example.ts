import type { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  ns.tprint(`Hello from VS Code! Money: $${ns.getServerMoneyAvailable("home").toLocaleString()}`);
}
