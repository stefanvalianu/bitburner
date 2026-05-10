import { useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { FormulasIcon, PortsIcon, ProgramsIcon, TorIcon } from "../ui/Icons";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { getPlayerMonitorState } from "../util/tasks/definitions/player-monitor/info";
import { Spinner } from "../ui/Spinner";
import { Modal } from "../ui/Modal";
import { ProgramsDialog } from "./ProgramsDialog";

interface MissingItemProps {
  icon: ReactNode;
  label: string;
  detail?: string;
}

function MissingItem({ icon, label, detail }: MissingItemProps) {
  const { colors, space } = useTheme();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: space.xs }}>
      {icon}
      <span style={{ color: colors.fg }}>{label}</span>
      {detail && <span style={{ color: colors.muted }}>{detail}</span>}
    </span>
  );
}

export function PlayerPanel() {
  const { colors, space } = useTheme();
  const { state } = useDashboardController();
  const playerState = getPlayerMonitorState(state);

  const [modalOpen, setModalOpen] = useState<boolean>(false);

  const hasPlayerState = playerState !== undefined && playerState.inventory !== undefined;

  const portsOwned = playerState?.inventory?.portOpeners.filter((p) => p.owned).length || 0;
  const programsOwned = playerState?.inventory?.programs.filter((p) => p.owned).length || 0;

  const missingTor = !hasPlayerState || !playerState.inventory!.hasRouter;
  const missingPorts = !hasPlayerState || portsOwned < playerState.inventory!.portOpeners.length;
  const missingFormulas = !hasPlayerState || !playerState.inventory!.hasFormulas;
  const missingPrograms = !hasPlayerState || programsOwned < playerState.inventory!.programs.length;

  // Once the game has reported an inventory and every item is owned, there's
  // nothing left to shop for — hide the panel entirely. During loading
  // (`!hasPlayerState`) every "missing" flag is true, so this never fires
  // before the inventory check has actually run.
  if (hasPlayerState && !missingTor && !missingPorts && !missingFormulas && !missingPrograms) {
    return null;
  }

  return (
    <>
      <Panel
        title="Shopping list"
        actions={
          <Button onClick={() => setModalOpen(true)} disabled={!hasPlayerState}>
            <ProgramsIcon color={colors.fg} />
            Inventory
          </Button>
        }
      >
        <Row gap={space.md}>
          {playerState === undefined || playerState.inventory === undefined ? (
            <Spinner active label="Player state not generated yet..." />
          ) : (
            <>
              {missingTor && (
                <>
                  <MissingItem icon={<TorIcon color={colors.warn} />} label="TOR router" />
                  <span style={{ color: colors.fg }}>·</span>
                </>
              )}
              {missingPorts && (
                <>
                  <MissingItem
                    icon={<PortsIcon color={colors.warn} />}
                    label="Port openers"
                    detail={`${portsOwned}/${playerState.inventory!.portOpeners.length}`}
                  />
                  <span style={{ color: colors.fg }}>·</span>
                </>
              )}
              {missingFormulas && (
                <>
                  <MissingItem icon={<FormulasIcon color={colors.warn} />} label="Formulas.exe" />
                  <span style={{ color: colors.fg }}>·</span>
                </>
              )}
            </>
          )}
        </Row>
      </Panel>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Inventory">
        <ProgramsDialog />
      </Modal>
    </>
  );
}
