import { NS } from "@ns";
import { PlayerInfo } from "@repo/common/info/playerInfo";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";
import { StatRow } from "@repo/features/components/StatRow";
import { ProgressBar } from "../components/ProgressBar";
import { Col } from "@repo/features/components/Col";

function skillProgressPct(
  ns: NS,
  playerInfo: PlayerInfo,
  level: number,
  xp: number,
  mult: number
): number {
  if (!playerInfo.hasFormulas) return 0;
  const currentLevelExp = ns.formulas.skills.calculateExp(level, mult);
  const nextLevelExp = ns.formulas.skills.calculateExp(level + 1, mult);
  const progress = (xp - currentLevelExp) / (nextLevelExp - currentLevelExp);
  return Math.max(0, Math.min(1, progress));
}

type Props = {
  playerInfo: PlayerInfo;
}

export function StatCard({ playerInfo }: Props) {
  const theme = useTheme();
  const ns = useNs();

  return (
    <Col gap={theme.spacing.xs} style={{ minWidth: 120, maxWidth: 160, flexShrink: 0 }}>
      <SkillRow
        label="hck"
        value={`${playerInfo.skillHacking}`}
        valueColor={theme.colors.code}
        progress={skillProgressPct(ns, playerInfo, playerInfo.skillHacking, playerInfo.xpHacking, playerInfo.multHacking)}
      />
      <SkillRow
        label="str"
        value={`${playerInfo.skillStrength}`}
        valueColor={theme.colors.white}
        progress={skillProgressPct(ns, playerInfo, playerInfo.skillStrength, playerInfo.xpStrength, playerInfo.multStrength)}
      />
      <SkillRow
        label="def"
        value={`${playerInfo.skillDefense}`}
        valueColor={theme.colors.white}
        progress={skillProgressPct(ns, playerInfo, playerInfo.skillDefense, playerInfo.xpDefense, playerInfo.multDefense)}
      />
      <SkillRow
        label="dex"
        value={`${playerInfo.skillDexterity}`}
        valueColor={theme.colors.white}
        progress={skillProgressPct(ns, playerInfo, playerInfo.skillDexterity, playerInfo.xpDexterity, playerInfo.multDexterity)}
      />
      <SkillRow
        label="agi"
        value={`${playerInfo.skillAgility}`}
        valueColor={theme.colors.white}
        progress={skillProgressPct(ns, playerInfo, playerInfo.skillAgility, playerInfo.xpAgility, playerInfo.multAgility)}
      />
      <SkillRow
        label="cha"
        value={`${playerInfo.skillCharisma}`}
        valueColor={theme.colors.cha}
        progress={skillProgressPct(ns, playerInfo, playerInfo.skillCharisma, playerInfo.xpCharisma, playerInfo.multCharisma)}
      />
      {(playerInfo.xpIntelligence > 0 || playerInfo.skillIntelligence > 1) && (
        <SkillRow
          label="int"
          value={`${playerInfo.skillIntelligence}`}
          valueColor={theme.colors.int}
          progress={skillProgressPct(ns, playerInfo, playerInfo.skillIntelligence, playerInfo.xpIntelligence, 1)}
        />
      )}
    </Col>
  );
}

interface SkillRowProps {
  label: string;
  value: string;
  valueColor: string;
  progress: number;
}

// A stat row with a thin progress bar flush beneath the number — no gap, so
// the bar visually reads as part of the row. The outer Col's gap separates
// the row+bar pair from the next stat.
function SkillRow({ label, value, valueColor, progress }: SkillRowProps) {
  return (
    <Col gap={0}>
      <StatRow label={label} value={value} valueColor={valueColor} />
      <ProgressBar value={progress} color={valueColor} />
    </Col>
  );
}
