import type { ReactNode } from "react";
import { Button } from "../ui/Button";
import { FormulasIcon, PortsIcon, ProgramsIcon, TorIcon, WrenchIcon } from "../ui/Icons";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { getPlayerMonitorState } from "../util/tasks/definitions/player-monitor/info";

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

export function ToolsPanel({ onOpen }: { onOpen?: () => void }) {
  const { colors, space } = useTheme();
  const { state } = useDashboardController();
  const playerMonitorState = getPlayerMonitorState(state);

  if (!playerMonitorState || !playerMonitorState.inventory) return null;

  const { hasTorRouter, hasFormulas, portOpeners, programs } = playerMonitorState.inventory;

  const portsOwned = portOpeners.filter((p) => p.owned).length;
  const programsOwned = programs.filter((p) => p.owned).length;

  const missingTor = !hasTorRouter;
  const missingPorts = portsOwned < portOpeners.length;
  const missingFormulas = !hasFormulas;
  const missingPrograms = programsOwned < programs.length;

  if (!missingTor && !missingPorts && !missingFormulas && !missingPrograms) return null;

  const actions = onOpen ? (
    <Button onClick={onOpen}>
      <WrenchIcon color={colors.warn} />
      Tools
    </Button>
  ) : undefined;

  return (
    <Panel title="Tools" actions={actions}>
      <Row gap={space.md}>
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
              detail={`${portsOwned}/${portOpeners.length}`}
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
            detail={`${programsOwned}/${programs.length}`}
          />
        )}
      </Row>
    </Panel>
  );
}
