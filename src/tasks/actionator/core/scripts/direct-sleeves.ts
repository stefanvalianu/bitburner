import { NS, SleeveCrimeTask } from "@ns";
import { GangInfo } from "@repo/common/info/gangInfo";
import { SleeveInfo } from "@repo/common/info/sleeveInfo";
import { GANG_INFO_PORT, getPortData, SLEEVE_INFO_PORT, USER_PREFERENCES_PORT } from "@repo/common/ports";
import { UserPreferences } from "@repo/common/preferences";
import { invokeNextScript } from "@repo/tasks/actionator/core/helpers";

const PRE_GANG_SHOCK_TARGET = 50;
const POST_GANG_SHOCK_TARGET = 0;

/*
  This script is responsible for:
  - assigning tasks to sleeves. This assumes all sleeves have max sync.
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  const sleeveInfo = getPortData<SleeveInfo>(ns, SLEEVE_INFO_PORT);
  const userPreferences = getPortData<UserPreferences>(ns, USER_PREFERENCES_PORT);

  const gangInfo = getPortData<GangInfo>(ns, GANG_INFO_PORT);
  const hasGang = gangInfo?.hasGang ?? false;

  if (!sleeveInfo || (userPreferences?.pauseSleeveActions ?? false)) {
    // this kills the active script, but returning for clarity
    invokeNextScript(ns);
    return;
  }

  const player = ns.getPlayer();

  /*
    Each sleeve will follow the following heuristics:
    - Before a gang is formed, the sleeve will aim for at least 50% shock recovery,
      then bring its stats to 75, then start doing homicides
    - After a gang is formed, the sleeve will aim for 0% shock
    - The default fallback right now is to perform 'Bond Forgery' for intelligence gains
  */
  for (const sleeve of sleeveInfo.sleeves) {
    if (sleeve.shock > (hasGang ? POST_GANG_SHOCK_TARGET : PRE_GANG_SHOCK_TARGET)) {
      if (sleeve.task !== "RECOVERY") {
        // keep them from changing frequently
        ns.sleeve.setToShockRecovery(sleeve.index);
      }
      continue;
    }

    /*
      Bring sleeves to 'Homicide' quality. Assumption that sleeves don't relocate.
      It's ok to re-assign them every 3s, doesn't damage the gains. Also, even after
      we have a gang, this is a good stat baseline to bring sleeves to for usefulness.
    */
    if (sleeve.str < 75) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "str");
      continue;
    }
    if (sleeve.def < 75) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "def");
      continue;
    }
    if (sleeve.dex < 75) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "dex");
      continue;
    }
    if (sleeve.agi < 75) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "agi");
      continue;
    }

    // we need better task resolution at this point than we want to capture in our port
    const sleeveTask = ns.sleeve.getTask(sleeve.index);
    const crimeTask = sleeveTask as SleeveCrimeTask;

    // We need to form a gang ASAP
    if (!hasGang) {
      // if we set the same crime again, it will be interrupted
      if (crimeTask === null || crimeTask.crimeType !== "Homicide") {
        ns.sleeve.setToCommitCrime(sleeve.index, "Homicide");
        continue;
      }

      // don't keep going down the task tree, we need to do this
      continue;
    }

    // After the gang is up, let's make the sleeves help the player train back up to a reasonable stat amount to help with infiltrations
    if (player.skills.hacking < 75) {
      ns.sleeve.setToUniversityCourse(sleeve.index, "Rothman University", "Algorithms");
      continue;
    }
    if (player.skills.strength < 100) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "str");
      continue;
    }
    if (player.skills.defense < 100) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "def");
      continue;
    }
    if (player.skills.dexterity < 75) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "dex");
      continue;
    }
    if (player.skills.agility < 75) {
      ns.sleeve.setToGymWorkout(sleeve.index, "Powerhouse Gym", "agi");
      continue;
    }

    if (crimeTask === null || crimeTask.crimeType !== "Bond Forgery") {
      ns.sleeve.setToCommitCrime(sleeve.index, "Bond Forgery");
    }
  }

  invokeNextScript(ns);
}
