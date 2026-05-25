import { NS } from "@ns";
import { HydraControllerState, HydraInstanceUpdate, HydraPlayerPasswordFile } from "@repo/common/info/hydra";
import { drainPortData, getPortData, HYDRA_STATE_PORT, HYDRA_UPDATE_PORT } from "@repo/common/ports";
import { bootstrapHydra, copyFilesAndStart } from "@repo/hydra/bootstrap";
import { ipv4ToUint32Fast } from "@repo/hydra/helpers";
import { HydraIpPortState } from "@repo/hydra/types";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

const STASIS_LINK_FILE = ".state/hydra_stasis_link.txt";

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

  /*
    Check for player-written passwords. Players can drop a file like the below in:

    {
      "passwords": [
        { "ip": "123", "password": "123" },
        { "ip": "123", "password": "123" },
      ]
    }
  */
  // will only work on home, which should be OK. TODO improve this
  try {
    const player_passwords = JSON.parse(ns.read(".state/hydra_passwords.json")) as HydraPlayerPasswordFile;

    for (const password of player_passwords.passwords) {
      const port = ipv4ToUint32Fast(password.ip);
      ns.writePort(port, {
        ip: password.ip,
        state: "infected",
        password: password.password
      } satisfies HydraIpPortState);
    }
  } catch {}

  const data = getPortData<HydraControllerState>(ns, HYDRA_STATE_PORT);

  // first run - spread hydra to darkweb
  if (data === undefined) {   
    let needsLink = true;
    /*
      Check for a stasis-link data file. Test it. If test fails, it's likely stale from a previous augmentation install.
    */
    try {
      const ip = ns.read(STASIS_LINK_FILE);

      if (ip) {
        const port = ipv4ToUint32Fast(ip);
        const portData = getPortData<HydraIpPortState>(ns, port);

        if (portData && portData.password && ns.dnet.connectToSession(ip, portData.password)) {
          ns.tprint(`Kickstarting hydra on stasis-linked ip ${ip}`);
          copyFilesAndStart(ns, ip);
          needsLink = false;
        } else {
          ns.tprint(`Stale stasis link info for ip ${ip}, deleting.`);
          ns.rm(STASIS_LINK_FILE);
        }
      }
    } catch{}

    ns.writePort(HYDRA_STATE_PORT, {
      up: true,
      haveLabyrinthStasis: !needsLink
    } satisfies HydraControllerState);

    await bootstrapHydra(ns);
    
    return;
  }

  // Drain update port
  const updates = drainPortData<HydraInstanceUpdate>(ns, HYDRA_UPDATE_PORT);
  if (updates && updates.length > 0) {
    for (const update of updates) {
      switch (update.type) {
        case "stasis-linking": {
          ns.write(STASIS_LINK_FILE, update.ip, "w");
          ns.clearPort(HYDRA_STATE_PORT);
          ns.writePort(HYDRA_STATE_PORT, {
            up: true,
            haveLabyrinthStasis: true
          } satisfies HydraControllerState);
        }
      }
    }
  }
}
