import type { ReactNode } from "react";
import { Button } from "../ui/Button";
import { FormulasIcon, PortsIcon, ProgramsIcon, TorIcon, WrenchIcon } from "../ui/Icons";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { getPlayerMonitorState } from "../util/tasks/definitions/player-monitor/info";
import { Spinner } from "../ui";

interface ToolItemProps {
  icon: ReactNode;
  label: string;
  detail?: string;
}

function ToolItem({ icon, label, detail }: ToolItemProps) {
  const { colors, space } = useTheme();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: space.xs }}>
      {icon}
      <span style={{ color: colors.fg }}>{label}</span>
      {detail && <span style={{ color: colors.muted }}>{detail}</span>}
    </span>
  );
}

export function PlayerPanel({ onOpen }: { onOpen?: () => void }) {
  const { colors, space } = useTheme();
  const { state } = useDashboardController();
  const playerState = getPlayerMonitorState(state);
  const hasPlayerState = playerState !== undefined && playerState.inventory !== undefined;

  const portsOwned = playerState?.inventory?.portOpeners.filter((p) => p.owned).length || 0;
  const programsOwned = playerState?.inventory?.programs.filter((p) => p.owned).length || 0;

  const missingTor = !hasPlayerState || !playerState.inventory!.hasTorRouter;
  const missingPorts = !hasPlayerState || portsOwned < playerState.inventory!.portOpeners.length;
  const missingFormulas = !hasPlayerState || !playerState.inventory!.hasFormulas;
  const missingPrograms = !hasPlayerState || programsOwned < playerState.inventory!.programs.length;

  const actions = onOpen ? (
    <Button onClick={onOpen} disabled={!hasPlayerState}>
      <WrenchIcon color={colors.warn} />
      Tools
    </Button>
  ) : undefined;

  return (
    <Panel title="Player" actions={actions}>
      <Row gap={space.md}>
        {playerState === undefined || playerState.inventory === undefined ? (
          <Spinner active label="Player state not generated yet..." />
        ) : (
          <>
            {missingTor && (
              <>
                <ToolItem icon={<TorIcon color={colors.warn} />} label="TOR router" />
                <span style={{ color: colors.fg }}>·</span>
              </>
            )}
            {missingPorts && (
              <>
                <ToolItem
                  icon={<PortsIcon color={colors.warn} />}
                  label="Port openers"
                  detail={`${portsOwned}/${playerState.inventory!.portOpeners.length}`}
                />
                <span style={{ color: colors.fg }}>·</span>
              </>
            )}
            {missingFormulas && (
              <>
                <ToolItem icon={<FormulasIcon color={colors.warn} />} label="Formulas.exe" />
                <span style={{ color: colors.fg }}>·</span>
              </>
            )}
            {missingPrograms && (
              <ToolItem
                icon={<ProgramsIcon color={colors.warn} />}
                label="Programs"
                detail={`${programsOwned}/${playerState.inventory!.programs.length}`}
              />
            )}
          </>
        )}
      </Row>
    </Panel>
  );
}
