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

  const maxDepth = 36; // max depth in endgame
  const maxRegularLinks = Math.max(0, ns.dnet.getStasisLinkLimit() - 1); // reserve 1 for lab-adjacent
  const disabledStasisDepth = Number.MAX_SAFE_INTEGER;

  const depthPerLink =
    maxRegularLinks > 0
      ? Math.floor(maxDepth / (maxRegularLinks + 1))
      : disabledStasisDepth;

  let stasisFile: StasisLinkFile = { regularLinks: [] };
  const rawStasis = ns.read(STASIS_LINK_FILE);

  if (rawStasis) {
    try {
      stasisFile = JSON.parse(rawStasis) as StasisLinkFile || { regularLinks: [] };
    } catch {}
  }

  stasisFile.regularLinks = stasisFile.regularLinks.slice(0, maxRegularLinks);

  const getNextStasisMinDepth = (): number => {
    if (maxRegularLinks <= 0) return disabledStasisDepth;
    if (stasisFile.regularLinks.length >= maxRegularLinks) return disabledStasisDepth;

    return (stasisFile.regularLinks.length + 1) * depthPerLink;
  };
  
  let stasisIps: string[] = [];
  if (stasisFile.labLink) {
    stasisIps.push(stasisFile.labLink.ip);
  }
  stasisIps.push(...stasisFile.regularLinks.map(link => link.ip));

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
      nextStasisMinDepth: getNextStasisMinDepth(),
      stasisLinkedIps: stasisIps
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
          clearStasisClaim = true;

          if (stasisFile.regularLinks.length >= maxRegularLinks) {
            break;
          }

          if (stasisFile.regularLinks.some(link => link.ip === update.info.ip)) {
            break;
          }

          if (stasisFile.labLink?.ip === update.info.ip) {
            break;
          }

          stasisFile.regularLinks.push(update.info);
          rewriteStasisFile = true;
        } break;

        case "lab-stasis-linking": {
          stasisFile.labLink = update.info;
          stasisFile.regularLinks = stasisFile.regularLinks.filter(link => link.ip !== update.info.ip);

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
    nextStasisMinDepth: getNextStasisMinDepth(),
    stasisLinkedIps: stasisIps
  } satisfies HydraControllerState);

  if (clearStasisClaim) {
    ns.clearPort(HYDRA_STASIS_CLAIM_PORT);
  }
}
