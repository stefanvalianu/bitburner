import { NS, Player, Server } from "@ns";

export function applyWeak(
  ns: NS,
  server: Server,
  threads: number,
  cores: number
) {
  server.hackDifficulty! -= ns.formulas.hacking.weakenEffect(
    threads,
    cores,
  );
}

export function applyHack(
  ns: NS,
  server: Server,
  threads: number,
) {
  server.hackDifficulty! += ns.hackAnalyzeSecurity(
    threads,
    server.hostname
  );
}

export function applyGrow(
  ns: NS,
  server: Server,
  player: Player,
  threads: number,
  cores: number,
  changeMoney: boolean
) {
  if (changeMoney) {
    server.moneyAvailable = Math.min(
      server.moneyMax!,
      ns.formulas.hacking.growAmount(
        server,
        player,
        threads,
        cores,
      )
    );
  }

  server.hackDifficulty! += ns.growthAnalyzeSecurity(
    threads,
    server.hostname,
    cores,
  );
}

export function applyHackingExp(
  ns: NS,
  server: Server,
  player: Player,
  threads: number,
): void {
  const expGain = ns.formulas.hacking.hackExp(server, player) * threads;

  player.exp.hacking += expGain;
  player.skills.hacking = ns.formulas.skills.calculateSkill(
    player.exp.hacking,
    player.mults.hacking,
  );
}