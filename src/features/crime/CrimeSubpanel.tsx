import { SectionHeading } from "@repo/features/components/SectionHeading";
import { StatRow } from "@repo/features/components/StatRow";
import { useNs } from "@repo/features/ns/NsProvider";
import { useDashboard } from "@repo/features/app/DashboardProvider";
import { GANG_INFO_PORT, getPortData } from "@repo/common/ports";
import { GangInfo } from "@repo/common/info/gangInfo";

export function CrimeSubpanel() {
  const ns = useNs();
  const { state } = useDashboard();

  const gangInfo = getPortData<GangInfo>(ns, GANG_INFO_PORT);
  const showGang = gangInfo && gangInfo.hasGang;

  return (
    <>
      {(!showGang || state.player.numPeopleKilled < 30) &&
        <>
          <SectionHeading>Crime</SectionHeading>
          <StatRow label="killed" value={ns.format.number(state.player.numPeopleKilled, 0)} />
          <StatRow label="karma" value={ns.format.number(state.player.karma, 2)} />
        </>
      }
      {showGang &&
        <>
          <SectionHeading>{gangInfo.name}</SectionHeading>
          <span>members {gangInfo.members.length} / {gangInfo.maxMembers}</span>
          <span>territory {ns.format.percent(gangInfo.territory)}%</span>
        </>
      } 
    </>
  )
}
