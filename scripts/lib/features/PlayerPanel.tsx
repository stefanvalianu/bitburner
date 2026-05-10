import { useState, type ReactNode } from "react";
import type { NS, Player } from "@ns";
import { Button } from "../ui/Button";
import { Col } from "../ui/Col";
import { FormulasIcon, PortsIcon, ProgramsIcon, TorIcon } from "../ui/Icons";
import { Modal } from "../ui/Modal";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { Spinner } from "../ui/Spinner";
import { useTheme } from "../ui/theme";
import { useNs } from "../util/ns";
import {
  getPlayerMonitorState,
  type Inventory,
} from "../util/tasks/definitions/player-monitor/info";
import { useDashboardController } from "../util/useDashboardController";
import { ProgramsDialog } from "./ProgramsDialog";

// Skills the player can train via game actions. Intelligence is excluded — the
// game grants it as a side-effect of other actions and there's no dedicated
// training loop, so a progress bar would be misleading.
type TrainableSkill = "hacking" | "strength" | "defense" | "dexterity" | "agility" | "charisma";

// Fraction of the way toward the next level for `skill`, in [0, 1]. Returns 0
// when Formulas.exe isn't owned — `ns.formulas.skills.calculateExp` throws at
// runtime without it, and we don't have a sensible fallback.
function skillProgressPct(
  ns: NS,
  player: Player,
  skill: TrainableSkill,
  hasFormulas: boolean,
): number {
  if (!hasFormulas) return 0;
  const currentLevel = player.skills[skill];
  const currentExp = player.exp[skill];
  const skillMult = player.mults[skill];
  const currentLevelExp = ns.formulas.skills.calculateExp(currentLevel, skillMult);
  const nextLevelExp = ns.formulas.skills.calculateExp(currentLevel + 1, skillMult);
  const progress = (currentExp - currentLevelExp) / (nextLevelExp - currentLevelExp);
  return Math.max(0, Math.min(1, progress));
}

export function PlayerPanel() {
  const { colors, space } = useTheme();
  const { state } = useDashboardController();
  const playerState = getPlayerMonitorState(state);

  const [modalOpen, setModalOpen] = useState<boolean>(false);

  const hasPlayerState =
    playerState !== undefined &&
    playerState.inventory !== undefined &&
    playerState.player !== undefined;

  const actions = (
    <Button onClick={() => setModalOpen(true)} disabled={!hasPlayerState}>
      <ProgramsIcon color={colors.fg} title="View programs" />
      Programs
    </Button>
  );

  return (
    <>
      <Panel title="Player" actions={actions}>
        {!hasPlayerState ? (
          <Spinner active label="Player state not generated yet..." />
        ) : (
          <Row gap={space.lg} style={{ alignItems: "flex-start" }}>
            <PlayerStats
              player={playerState.player}
              hasFormulas={playerState.inventory.hasFormulas}
            />
            <Col gap={space.md} style={{ flex: 1, minWidth: 0 }}>
              <Location city={playerState.player.city} />
              <CrimeSection player={playerState.player} />
              <ShoppingList inventory={playerState.inventory} />
            </Col>
          </Row>
        )}
      </Panel>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Inventory">
        <ProgramsDialog />
      </Modal>
    </>
  );
}

function SectionHeading({ children }: { children: string }) {
  const { colors, space } = useTheme();
  return (
    <span
      style={{
        color: colors.fgDim,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1,
        paddingTop: space.xs,
      }}
    >
      {children}
    </span>
  );
}

interface StatRowProps {
  label: string;
  value: string;
  valueColor?: string;
}

function StatRow({ label, value, valueColor }: StatRowProps) {
  const { colors, space } = useTheme();
  return (
    <Row gap={space.sm} style={{ justifyContent: "space-between" }}>
      <span style={{ color: colors.muted }}>{label}</span>
      <span style={{ color: valueColor ?? colors.fg, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </Row>
  );
}

interface PlayerStatsProps {
  player: Player;
  hasFormulas: boolean;
}

function PlayerStats({ player, hasFormulas }: PlayerStatsProps) {
  const { colors, space } = useTheme();
  const ns = useNs();
  const fmtInt = (n: number) => ns.format.number(n, 0);
  const pct = (s: TrainableSkill) => skillProgressPct(ns, player, s, hasFormulas);
  return (
    <Col gap={space.xs} style={{ minWidth: 120, maxWidth: 160, flexShrink: 0 }}>
      <SectionHeading>Stats</SectionHeading>
      <StatRow
        label="HP"
        value={`${fmtInt(player.hp.current)}/${fmtInt(player.hp.max)}`}
        valueColor={colors.hp}
      />
      <StatRow label="$" value={ns.format.number(player.money, 2)} valueColor={colors.money} />
      <div style={{ borderTop: `1px solid ${colors.fgDim}`, margin: `${space.xs}px 0` }} />
      <SkillRow
        label="hck"
        value={fmtInt(player.skills.hacking)}
        valueColor={colors.hack}
        progress={pct("hacking")}
      />
      <SkillRow
        label="str"
        value={fmtInt(player.skills.strength)}
        valueColor={colors.white}
        progress={pct("strength")}
      />
      <SkillRow
        label="def"
        value={fmtInt(player.skills.defense)}
        valueColor={colors.white}
        progress={pct("defense")}
      />
      <SkillRow
        label="dex"
        value={fmtInt(player.skills.dexterity)}
        valueColor={colors.white}
        progress={pct("dexterity")}
      />
      <SkillRow
        label="agi"
        value={fmtInt(player.skills.agility)}
        valueColor={colors.white}
        progress={pct("agility")}
      />
      <SkillRow
        label="cha"
        value={fmtInt(player.skills.charisma)}
        valueColor={colors.cha}
        progress={pct("charisma")}
      />
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

// Bar geometry pinned in pixels on both halves so subpixel rendering can't
// give each row a slightly different height.
const BAR_HEIGHT = 2;

function ProgressBar({ value, color }: { value: number; color: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      style={{
        width: "100%",
        height: BAR_HEIGHT,
        background: colors.well,
        overflow: "hidden",
      }}
    >
      <div style={{ width: `${pct}%`, height: BAR_HEIGHT, background: color }} />
    </div>
  );
}

function Location({ city }: { city: string }) {
  const { colors } = useTheme();
  return <span style={{ color: colors.fg }}>📍 {city}</span>;
}

function CrimeSection({ player }: { player: Player }) {
  const { space } = useTheme();
  const ns = useNs();
  return (
    <Col gap={space.xs}>
      <SectionHeading>Crime</SectionHeading>
      <StatRow label="killed" value={ns.format.number(player.numPeopleKilled, 0)} />
      <StatRow label="karma" value={ns.format.number(player.karma, 2)} />
    </Col>
  );
}

interface ShoppingItemProps {
  icon: ReactNode;
  label: string;
  detail?: string;
}

function ShoppingItem({ icon, label, detail }: ShoppingItemProps) {
  const { colors, space } = useTheme();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: space.xs }}>
      {icon}
      <span style={{ color: colors.fg }}>{label}</span>
      {detail && <span style={{ color: colors.muted }}>{detail}</span>}
    </span>
  );
}

function ShoppingList({ inventory }: { inventory: Inventory }) {
  const { colors, space } = useTheme();
  const portsOwned = inventory.portOpeners.filter((p) => p.owned).length;
  const missingTor = !inventory.hasRouter;
  const missingPorts = portsOwned < inventory.portOpeners.length;
  const missingFormulas = !inventory.hasFormulas;

  if (!missingTor && !missingPorts && !missingFormulas) {
    return null;
  }

  return (
    <Col gap={space.xs}>
      <SectionHeading>Shopping list</SectionHeading>
      <Row gap={space.md} style={{ flexWrap: "wrap" }}>
        {missingTor && <ShoppingItem icon={<TorIcon color={colors.warn} />} label="TOR router" />}
        {missingPorts && (
          <ShoppingItem
            icon={<PortsIcon color={colors.warn} />}
            label="Port openers"
            detail={`${portsOwned}/${inventory.portOpeners.length}`}
          />
        )}
        {missingFormulas && (
          <ShoppingItem icon={<FormulasIcon color={colors.warn} />} label="Formulas.exe" />
        )}
      </Row>
    </Col>
  );
}
