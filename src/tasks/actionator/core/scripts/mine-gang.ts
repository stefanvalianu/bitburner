import { GangMemberInfo, NS } from "@ns";
import { ACTIONATOR_QUEUE_PORT, GANG_INFO_PORT } from "@repo/common/ports";
import { GangInfo, GangMember, MemberRank } from "@repo/common/info/gangInfo";
import { invokeNextScript, requestTaskStart } from "@repo/tasks/actionator/core/helpers";
import { GANG_BANGER_TASK_ID } from "@repo/tasks/gang-banger/info";
import { GANG_EQUIPMENT_SCRIPT } from "./identify-gang";

const KARMA_TO_START_GANG = -54_000;

/*
  This script is responsible for:
  - Providing gang information on the GANG_INFO_PORT
  - Requesting a start of the "gang-banger" script if not in a gang but ready
*/
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  
  const inGang = ns.gang.inGang();
  const player = ns.getPlayer();

  if (!inGang && player.karma <= KARMA_TO_START_GANG) {
    // this script will start a gang when instantiated, breaking this cycle
    requestTaskStart(ns, GANG_BANGER_TASK_ID);

    // this script ran first; if we weren't in a gang, it didn't actually run, but we need it
    ns.writePort(ACTIONATOR_QUEUE_PORT, GANG_EQUIPMENT_SCRIPT);
  }

  if (!inGang) {
    ns.clearPort(GANG_INFO_PORT);
    ns.writePort(GANG_INFO_PORT, {
      hasGang: false,
      members: [],
      territory: 0
    } satisfies GangInfo);
    invokeNextScript(ns);
    return;
  }

  const gang = ns.gang.getGangInformation();
  const members = ns.gang.getMemberNames().map(n => ns.gang.getMemberInformation(n));
  const gangMembers = members.map(m => ({
    name: m.name,
    rank: getMemberRank(m),
    avgCombatMult: (m.str_mult + m.def_mult + m.dex_mult + m.agi_mult) / 4,
    avgCombatSkill: (m.str + m.def + m.dex + m.agi) / 4,
  } satisfies GangMember));

  ns.clearPort(GANG_INFO_PORT);
  ns.writePort(GANG_INFO_PORT, {
    hasGang: inGang,
    members: gangMembers,
    territory: gang.territory
  } satisfies GangInfo);

  invokeNextScript(ns);
}

function getMemberRank(member: GangMemberInfo): MemberRank {
  // rank is checked by measuring the average combat ascension
  // multipliers vs static thresholds (described in `info.ts`)
  const ascensionMult = getMemberAscensionMultiplier(member);
  if (ascensionMult < 6) return 1;
  if (ascensionMult < 16) return 2;
  if (ascensionMult < 32) return 3;
  return 4;
}

function getMemberAscensionMultiplier(member: GangMemberInfo): number {
  return Math.min(
    //member.agi_asc_mult, // we omit agility because it seems to always be significantly lower than the other asc multipliers, greatly slowing down asc timings
    member.def_asc_mult,
    member.dex_asc_mult,
    member.str_asc_mult,
  );
}