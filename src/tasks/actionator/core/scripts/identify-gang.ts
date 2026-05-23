import { NS } from "@ns";
import { GangEquipmentInfo } from "@repo/common/info/gangInfo";
import { GANG_EQUIPMENT_PORT } from "@repo/common/ports";
import { invokeNextScript, requestTaskStart } from "@repo/tasks/actionator/core/helpers";
import { GANG_BANGER_TASK_ID } from "@repo/tasks/gang-banger/info";

export const GANG_EQUIPMENT_SCRIPT = "tasks/actionator/core/scripts/identify-gang.js";

/*
  This script is responsible for:
  - Producing a list of all useful gang equipment (one-off)

  NOTE this script cannot actually be ran before the player is in a gang.
  As such, it will be re-added by the regular mine-gang script when it actually
  becomes runnable.
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.atExit(() => invokeNextScript(ns));

  let augmentations: string[] = [];
  let equipment: string[] = [];

  if (!ns.gang.inGang()) {
    return;
  }

  // Create the equipment list
  const equipmentNames = ns.gang.getEquipmentNames();
  for (const equipmentName of equipmentNames) {
    const type = ns.gang.getEquipmentType(equipmentName);

    if (type === "Augmentation") {
      augmentations.push(equipmentName);
    } else {
      equipment.push(equipmentName);
    }
  }

  ns.clearPort(GANG_EQUIPMENT_PORT);
  ns.writePort(GANG_EQUIPMENT_PORT, {
    augmentations: augmentations,
    normalEquipment: equipment
  } satisfies GangEquipmentInfo);

  /*
    This script runs when actionator runs, almost always at startup.
    As such, let's also kick off the gang-banger script to help users
    re-setup on relaunch.
  */
  requestTaskStart(ns, GANG_BANGER_TASK_ID);
}
