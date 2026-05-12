import { NS, Player, Server } from "@ns";

export interface GrowWeakSplit {
  growThreads: number;
  weakThreads: number;
}

export interface HackWeakGrowWeakSplit {
  hackThreads: number;
  weak1Threads: number;
  growThreads: number;
  weak2Threads: number;
}

/*


    if (frame.purpose === "GW") {
    }

    this.ns.formulas.hacking.hackExp;
    // how many threads we need to grow server from some start state to max money
    this.ns.formulas.hacking.growThreads();

    // how long it would take to weaken a server
    this.ns.formulas.hacking.weakenTime();

    // how long it would take to grow a server
    this.ns.formulas.hacking.growTime();

    // how long it would take to hack a server
    this.ns.formulas.hacking.hackTime();

    // how much xp we'll get from a hack; use this to keep the player object updated so we appropriately simulate times/etc in frame calculations
    this.ns.formulas.hacking.hackExp();

    // what % of the server's money we will steal with one hack thread.
    // this will be useful in prioritizing targets (if we steal a large % with one thread, probably not great) but also
    // in understanding the state we will leave our server in after a hack operation.
    this.ns.formulas.hacking.hackPercent();

    // amount of security decrease from running weaken.
    // from testing, this appears purely linear, so we
    // can compute for a single thread and extrapolate
    // how many threads we need. Note that floating point
    // rounding errors might pose an actual challenge lol
    this.ns.formulas.hacking.weakenEffect();
    */

// Attempts to find a Grow/Weak split of threads given the constraints.
// Does NOT modify the original player/server objects.
// Returns undefined on failure
export function tryFindGrowWeakSplit(
  ns: NS,
  maxRam: number,
  cores: number,
  originalPlayer: Player,
  originalTarget: Server,
): GrowWeakSplit | undefined {
  return undefined;
}

// Attempts to find a HWGW split of threads given the constraints. Does
// NOT modify the original player/server objects.
// Returns undefined on failure.
export function tryFindHackWeakGrowWeakSplit(
  ns: NS,
  maxRam: number,
  cores: number,
  originalPlayer: Player,
  originalTarget: Server,
): HackWeakGrowWeakSplit | undefined {
  return undefined;
}

function clonePlayer(ns: NS, originalPlayer: Player): Player {
  // starting from the real player and applying necessary
  // transforms on the odd chance we miss some important property
  let newPlayer = ns.getPlayer();
  // only the hacking skill should be relevant here (augments, mults,
  // etc) won't be changing during these calculations.
  newPlayer.skills.hacking = originalPlayer.skills.hacking;
  return newPlayer;
}

function cloneServer(ns: NS, originalServer: Server): Server {
  let newServer = ns.getServer(originalServer.hostname) as Server;
  // only these properties should be changing as part of our calculations
  newServer.hackDifficulty = originalServer.hackDifficulty;
  newServer.moneyAvailable = originalServer.moneyAvailable;
  return newServer;
}
