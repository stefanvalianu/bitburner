import { NS } from "@ns";
import { HydraControllerState, HydraInstanceUpdate, STASIS_LINK_FILE, StasisLinkFile } from "@repo/common/info/hydra";
import { drainPortData, getPortData, HYDRA_STASIS_CLAIM_PORT, HYDRA_STATE_PORT, HYDRA_UPDATE_PORT, SCP_FILES_PORT } from "@repo/common/ports";
import { bootstrapHydra } from "@repo/hydra/bootstrap";
import { spawnHydra } from "@repo/hydra/infect-helper";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

/*
  This script is responsible for:
  - Kickstarting the hydra virus on the network
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));

  // Cannot continue without darkscape navigator
  if (!ns.fileExists(ns.enums.ProgramName.darkscape, "home")) {
    return;
  }

  const data = getPortData<HydraControllerState>(ns, HYDRA_STATE_PORT);
  
  const maxLinks = ns.dnet.getStasisLinkLimit() - 1; // always reserve 1 for lab-adjacent
  const maxDepth = 36; // max depth in endgame
  const depthPerLink = Math.floor(maxDepth / (maxLinks + 1));
  let stasisFile: StasisLinkFile = { regularLinks: [] };
  let rawStasis = ns.read(STASIS_LINK_FILE);

  if (rawStasis) {
    try {
      stasisFile = JSON.parse(rawStasis) as StasisLinkFile || { regularLinks: [] };
    } catch {}
  }

  // first run - spread hydra to darkweb
  if (data === undefined) {
    // Ensure these are on the port
    const files = ns.ls("home", ".js");
  
    ns.clearPort(SCP_FILES_PORT);
    ns.writePort(SCP_FILES_PORT, files);
    
    if (stasisFile.labLink && ns.dnet.connectToSession(stasisFile.labLink.ip, stasisFile.labLink.password)) {
      spawnHydra(ns, stasisFile.labLink.ip);
    }

    for (const link of stasisFile.regularLinks) {
      if (ns.dnet.connectToSession(link.ip, link.password)) {
        spawnHydra(ns, link.ip);
      }
    }

    ns.writePort(HYDRA_STATE_PORT, {
      up: true,
      haveLabyrinthStasis: stasisFile.labLink !== undefined,
      playerCharisma: ns.getPlayer().skills.charisma,
      nextStasisMinDepth : (stasisFile.regularLinks.length + 1) * depthPerLink,
    } satisfies HydraControllerState);

    await bootstrapHydra(ns);

    return;
  }

  let rewriteStasisFile = false;
  let clearStasisClaim = false;

  // Drain update port
  const updates = drainPortData<HydraInstanceUpdate>(ns, HYDRA_UPDATE_PORT);
  if (updates && updates.length > 0) {
    for (const update of updates) {
      switch (update.type) {
        case "stasis-linking": {
          stasisFile.regularLinks.push(update.info);
          rewriteStasisFile = true;
          clearStasisClaim = true;
        } break;
        case "lab-stasis-linking": {
          stasisFile.labLink = update.info;
          rewriteStasisFile = true;
        } break;
      }
    }
  }

  if (rewriteStasisFile) {
    ns.write(STASIS_LINK_FILE, JSON.stringify(stasisFile), "w");
  }

  // Publish new state
  ns.clearPort(HYDRA_STATE_PORT);
  ns.writePort(HYDRA_STATE_PORT, {
    up: true,
    haveLabyrinthStasis: stasisFile.labLink !== undefined,
    playerCharisma: ns.getPlayer().skills.charisma,
    nextStasisMinDepth : (stasisFile.regularLinks.length + 1) * depthPerLink,
  } satisfies HydraControllerState);

  if (clearStasisClaim) {
    ns.clearPort(HYDRA_STASIS_CLAIM_PORT);
  }
}
