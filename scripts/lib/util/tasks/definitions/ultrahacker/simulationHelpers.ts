import { NS, Player, Server } from "@ns";

export function applyWeak(ns: NS, server: Server, threads: number, cores: number) {
  // Math.ceil on caller-side thread counts means we typically over-weaken by a
  // fraction; clamp so we never report below the floor the game enforces.
  server.hackDifficulty = Math.max(
    server.minDifficulty!,
    server.hackDifficulty! - ns.formulas.hacking.weakenEffect(threads, cores),
  );
}

export function applyHack(ns: NS, server: Server, player: Player, threads: number) {
  // Per-thread money fraction stolen on a successful hack. Ultrahacker is gated
  // on Formulas.exe and runs in endgame, so hackChance ≈ 1; we don't multiply
  // by hackChance here, but if this ever gets used at lower skill we should.
  const hackPct = ns.formulas.hacking.hackPercent(server, player);
  server.moneyAvailable = Math.max(
    0,
    server.moneyAvailable! - server.moneyAvailable! * hackPct * threads,
  );
  server.hackDifficulty! += ns.hackAnalyzeSecurity(threads, server.hostname);
}

export function applyGrow(
  ns: NS,
  server: Server,
  player: Player,
  threads: number,
  cores: number,
  changeMoney: boolean,
) {
  if (changeMoney) {
    server.moneyAvailable = Math.min(
      server.moneyMax!,
      ns.formulas.hacking.growAmount(server, player, threads, cores),
    );
  }

  server.hackDifficulty! += ns.growthAnalyzeSecurity(threads, server.hostname, cores);
}

export function applyHackingExp(ns: NS, server: Server, player: Player, threads: number): void {
  const expGain = ns.formulas.hacking.hackExp(server, player) * threads;

  player.exp.hacking += expGain;
  player.skills.hacking = ns.formulas.skills.calculateSkill(
    player.exp.hacking,
    player.mults.hacking,
  );
}
