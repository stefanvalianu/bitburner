import { NS } from "@ns";
import { GangEquipmentInfo } from "@repo/common/info/gangInfo";
import { GANG_EQUIPMENT_PORT } from "@repo/common/ports";

/*
  This script is responsible for:
  - Producing a list of all useful gang equipment (one-off)
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");

  let augmentations: string[] = [];
  let equipment: string[] = [];

  // Create the equipment list
  const equipmentNames = ns.gang.getEquipmentNames();
  for (const equipmentName of equipmentNames) {
    const type = ns.gang.getEquipmentType(equipmentName);
    const stats = ns.gang.getEquipmentStats(equipmentName);

    // skip equipment with irrelevant stats
    if (!stats.str && !stats.def && !stats.agi && !stats.dex) continue;

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
}
