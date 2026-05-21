import { NS, Player } from "@ns";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { useNs } from "@repo/features/ns/NsProvider";
import { StatRow } from "@repo/features/components/StatRow";
import { ProgressBar } from "../components/ProgressBar";
import { Col } from "@repo/features/components/Col";

function skillProgressPct(
  ns: NS,
  player: Player,
  skill: "hacking" | "strength" | "defense" | "dexterity" | "agility" | "charisma" | "intelligence",
): number {
  const mult = skill === "intelligence" ? 1 : player.mults[skill];
  const currentLevelExp = ns.formulas.skills.calculateExp(player.skills[skill], mult);
  const nextLevelExp = ns.formulas.skills.calculateExp(player.skills[skill] + 1, mult);
  const progress = (player.exp[skill] - currentLevelExp) / (nextLevelExp - currentLevelExp);
  return Math.max(0, Math.min(1, progress));
}

type Props = {
  player: Player;
}

export function StatCard({ player }: Props) {
  const theme = useTheme();
  const ns = useNs();

  const hasFormulas = ns.fileExists(ns.enums.ProgramName.formulas, "home");

  return (
    <Col gap={theme.spacing.xs} style={{ minWidth: 120, maxWidth: 160, flexShrink: 0 }}>
      <SkillRow
        label="hck"
        value={`${player.skills.hacking}`}
        valueColor={theme.colors.code}
        progress={hasFormulas ? skillProgressPct(ns, player, "hacking") : 0}
      />
      <SkillRow
        label="str"
        value={`${player.skills.strength}`}
        valueColor={theme.colors.white}
        progress={hasFormulas ? skillProgressPct(ns, player, "strength") : 0}
      />
      <SkillRow
        label="def"
        value={`${player.skills.defense}`}
        valueColor={theme.colors.white}
        progress={hasFormulas ? skillProgressPct(ns, player, "defense") : 0}
      />
      <SkillRow
        label="dex"
        value={`${player.skills.dexterity}`}
        valueColor={theme.colors.white}
        progress={hasFormulas ? skillProgressPct(ns, player, "dexterity") : 0}
      />
      <SkillRow
        label="agi"
        value={`${player.skills.agility}`}
        valueColor={theme.colors.white}
        progress={hasFormulas ? skillProgressPct(ns, player, "agility") : 0}
      />
      <SkillRow
        label="cha"
        value={`${player.skills.charisma}`}
        valueColor={theme.colors.cha}
        progress={hasFormulas ? skillProgressPct(ns, player, "charisma") : 0}
      />
      {(player.exp.intelligence > 0 || player.skills.intelligence > 1) && (
        <SkillRow
          label="int"
          value={`${player.skills.intelligence}`}
          valueColor={theme.colors.int}
          progress={hasFormulas ? skillProgressPct(ns, player, "intelligence") : 0}
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
