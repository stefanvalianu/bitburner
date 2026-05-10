import { useState, type ReactNode } from "react";
import type { Player } from "@ns";
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
      <ProgramsIcon color={colors.fg} />
      Inventory
    </Button>
  );

  return (
    <>
      <Panel title="Player" actions={actions}>
        {!hasPlayerState ? (
          <Spinner active label="Player state not generated yet..." />
        ) : (
          <Row gap={space.lg} style={{ alignItems: "flex-start" }}>
            <PlayerStats player={playerState.player} />
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

function PlayerStats({ player }: { player: Player }) {
  const { colors, space } = useTheme();
  const ns = useNs();
  const fmtInt = (n: number) => ns.format.number(n, 0);
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
      <StatRow label="hck" value={fmtInt(player.skills.hacking)} valueColor={colors.hack} />
      <StatRow label="str" value={fmtInt(player.skills.strength)} />
      <StatRow label="def" value={fmtInt(player.skills.defense)} />
      <StatRow label="dex" value={fmtInt(player.skills.dexterity)} />
      <StatRow label="agi" value={fmtInt(player.skills.agility)} />
      <StatRow label="cha" value={fmtInt(player.skills.charisma)} />
    </Col>
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
  const programsOwned = inventory.programs.filter((p) => p.owned).length;
  const missingTor = !inventory.hasRouter;
  const missingPorts = portsOwned < inventory.portOpeners.length;
  const missingFormulas = !inventory.hasFormulas;
  const missingPrograms = programsOwned < inventory.programs.length;

  if (!missingTor && !missingPorts && !missingFormulas && !missingPrograms) {
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
        {missingPrograms && (
          <ShoppingItem
            icon={<ProgramsIcon color={colors.warn} />}
            label="Programs"
            detail={`${programsOwned}/${inventory.programs.length}`}
          />
        )}
      </Row>
    </Col>
  );
}
