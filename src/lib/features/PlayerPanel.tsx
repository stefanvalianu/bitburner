import { useRef, useState, type ReactNode } from "react";
import type { NS, Player } from "@ns";
import { Button } from "../../features/components/Button";
import { Col } from "../../features/components/Col";
import { FormulasIcon, PortsIcon, ProgramsIcon, TorIcon } from "../../features/components/Icons";
import { Modal } from "../../features/components/Modal";
import { Panel } from "../../features/components/Panel";
import { Row } from "../../features/components/Row";
import { SectionHeading } from "../../features/components/SectionHeading";
import { Spinner } from "../../features/components/Spinner";
import { StatRow } from "../../features/components/StatRow";
import {
  getPlayerMonitorState,
  PLAYER_MONITOR_FAST_REFRESH_FREQUENCY_MS,
  PlayerMonitorTaskState,
  type Inventory,
} from "../util/tasks/definitions/player-monitor/info";
import { useDashboardController } from "../util/useDashboardController";
import { usePreferences } from "../util/usePreferences";
import { ProgramsDialog } from "./ProgramsDialog";
import { useLivePlayerState } from "../util/useLivePlayerState";
import { useTheme } from "../../features/theme/ThemeProvider";
import { useNs } from "../../features/ns/NsProvider";

// Skills the player can train via game actions.
type TrainableSkill =
  | "hacking"
  | "strength"
  | "defense"
  | "dexterity"
  | "agility"
  | "charisma"
  | "intelligence";

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
  const skillMult = skill === "intelligence" ? 1 : player.mults[skill];
  const currentLevelExp = ns.formulas.skills.calculateExp(currentLevel, skillMult);
  const nextLevelExp = ns.formulas.skills.calculateExp(currentLevel + 1, skillMult);
  const progress = (currentExp - currentLevelExp) / (nextLevelExp - currentLevelExp);
  return Math.max(0, Math.min(1, progress));
}

export function PlayerPanel() {
  const theme = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();
  const { preferences } = usePreferences();
  const playerState = getPlayerMonitorState(state);

  const [modalOpen, setModalOpen] = useState<boolean>(false);

  const hasPlayerState =
    playerState !== undefined &&
    playerState.inventory !== undefined &&
    playerState.player !== undefined;

  const actions = (
    <Row gap={theme.spacing.sm} style={{ alignItems: "center" }}>
      {preferences?.reservedMoney > 0 && (
        <span style={{ color: theme.colors.secondary, fontSize: "0.85em" }}>
          {`Reserved: $${ns.format.number(preferences.reservedMoney, 2)}`}
        </span>
      )}
      <Button onClick={() => setModalOpen(true)} disabled={!hasPlayerState}>
        <ProgramsIcon color={theme.colors.primary} title="View programs" />
        Programs
      </Button>
    </Row>
  );

  return (
    <>
      <Panel title="Player" actions={actions}>
        {!hasPlayerState ? (
          <Spinner active label="Player state not generated yet..." />
        ) : (
          <Row gap={theme.spacing.lg} style={{ alignItems: "flex-start" }}>
            <PlayerStats dashboardPlayerTaskState={playerState} />
            <Col gap={theme.spacing.md} style={{ flex: 1, minWidth: 0 }}>
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

interface PlayerStatsProps {
  dashboardPlayerTaskState: PlayerMonitorTaskState;
}

function PlayerStats(props: PlayerStatsProps) {
  const theme = useTheme();
  const ns = useNs();
  const { player, inventory } = useLivePlayerState(props.dashboardPlayerTaskState);
  const pct = (s: TrainableSkill) => skillProgressPct(ns, player, s, inventory.hasFormulas);

  return (
    <Col gap={theme.spacing.xs} style={{ minWidth: 120, maxWidth: 160, flexShrink: 0 }}>
      <SkillRow
        label="hck"
        value={`${player.skills.hacking}`}
        valueColor={theme.colors.code}
        progress={pct("hacking")}
      />
      <SkillRow
        label="str"
        value={`${player.skills.strength}`}
        valueColor={theme.colors.white}
        progress={pct("strength")}
      />
      <SkillRow
        label="def"
        value={`${player.skills.defense}`}
        valueColor={theme.colors.white}
        progress={pct("defense")}
      />
      <SkillRow
        label="dex"
        value={`${player.skills.dexterity}`}
        valueColor={theme.colors.white}
        progress={pct("dexterity")}
      />
      <SkillRow
        label="agi"
        value={`${player.skills.agility}`}
        valueColor={theme.colors.white}
        progress={pct("agility")}
      />
      <SkillRow
        label="cha"
        value={`${player.skills.charisma}`}
        valueColor={theme.colors.cha}
        progress={pct("charisma")}
      />
      {(player.exp.intelligence > 0 || player.skills.intelligence > 1) && (
        <SkillRow
          label="int"
          value={`${player.skills.intelligence}`}
          valueColor={theme.colors.int}
          progress={pct("intelligence")}
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

// Bar geometry pinned in pixels on both halves so subpixel rendering can't
// give each row a slightly different height.
const BAR_HEIGHT = 2;

function ProgressBar({ value, color }: { value: number; color: string }) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  // Suppress the transition when pct drops (level-up resets progress to ~0) so
  // the bar snaps instead of visibly draining backwards.
  const prevPct = useRef(pct);
  const animate = pct >= prevPct.current;
  prevPct.current = pct;
  return (
    <div
      style={{
        width: "100%",
        height: BAR_HEIGHT,
        background: theme.colors.well,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: BAR_HEIGHT,
          background: color,
          transition: animate
            ? `width ${PLAYER_MONITOR_FAST_REFRESH_FREQUENCY_MS}ms linear`
            : "none",
        }}
      />
    </div>
  );
}

function Location({ city }: { city: string }) {
  const theme = useTheme();
  return <span style={{ color: theme.colors.primary }}>📍 {city}</span>;
}

function CrimeSection({ player }: { player: Player }) {
  const theme = useTheme();
  const ns = useNs();
  return (
    <Col gap={theme.spacing.xs}>
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
  const theme = useTheme();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: theme.spacing.xs }}>
      {icon}
      <span style={{ color: theme.colors.primary }}>{label}</span>
      {detail && <span style={{ color: theme.colors.secondary }}>{detail}</span>}
    </span>
  );
}

function ShoppingList({ inventory }: { inventory: Inventory }) {
  const theme = useTheme();
  const portsOwned = inventory.portOpeners.filter((p) => p.owned).length;
  const missingTor = !inventory.hasRouter;
  const missingPorts = portsOwned < inventory.portOpeners.length;
  const missingFormulas = !inventory.hasFormulas;

  if (!missingTor && !missingPorts && !missingFormulas) {
    return null;
  }

  return (
    <Col gap={theme.spacing.xs}>
      <SectionHeading>Shopping list</SectionHeading>
      <Row gap={theme.spacing.md} style={{ flexWrap: "wrap" }}>
        {missingTor && <ShoppingItem icon={<TorIcon color={theme.colors.warning} />} label="TOR router" />}
        {missingPorts && (
          <ShoppingItem
            icon={<PortsIcon color={theme.colors.warning} />}
            label="Port openers"
            detail={`${portsOwned}/${inventory.portOpeners.length}`}
          />
        )}
        {missingFormulas && (
          <ShoppingItem icon={<FormulasIcon color={theme.colors.warning} />} label="Formulas.exe" />
        )}
      </Row>
    </Col>
  );
}
