import { useEffect } from "react";
import { useLogger } from "../util/logging/log";
import { useNs } from "../util/ns";
import { Button } from "../ui/Button";
import { WorldIcon } from "../ui/Icons";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { Spinner } from "../ui/Spinner";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { getPlayerMonitorState } from "../util/tasks/definitions/player-monitor/info";

export function ServerPanel({ onOpenMap }: { onOpenMap?: () => void }) {
  const ns = useNs();
  const log = useLogger("server-panel");
  const { colors, space } = useTheme();
  const { state } = useDashboardController();

  // Categorize once. Backdoored implies admin rights, so the nuked bucket
  // excludes backdoored to avoid double-counting. Player-owned is its own
  // bucket — purchased servers always have admin rights but shouldn't inflate
  // the nuked/backdoored tallies. "Targets" is the leftover: everything not
  // yet nuked and not player-owned, regardless of whether we can pwn it now.
  const playerOwned = state.allServers.filter((s) => s.purchasedByPlayer).length;
  const backdoored = state.allServers.filter(
    (s) => s.backdoorInstalled && !s.purchasedByPlayer,
  ).length;
  const nuked = state.allServers.filter(
    (s) => s.hasAdminRights && !s.backdoorInstalled && !s.purchasedByPlayer,
  ).length;
  const targets = state.allServers.length - playerOwned - nuked - backdoored;

  // NUKE every pwnable server every gameState tick. The port-opener calls
  // throw if the corresponding .exe isn't owned, so we gate each one on
  // inventory. NUKE itself is unconditional — the pwnable filter already
  // confirmed admin rights are missing and the requirements are met.
  useEffect(() => {
    const playerState = getPlayerMonitorState(state);
    const ownedPortOpeners = playerState?.inventory?.portOpeners.filter((p) => p.owned).length || 0;
    const hackingLevel = playerState?.stats?.hackingLevel || 0;

    const pwnable = state.allServers.filter(
      (s) =>
        !s.hasAdminRights &&
        !s.purchasedByPlayer &&
        hackingLevel >= (s.requiredHackingSkill || 0) &&
        ownedPortOpeners >= (s.numOpenPortsRequired || 0),
    );

    if (pwnable.length === 0) return;
    const PN = ns.enums.ProgramName;
    const owned = new Set(
      playerState?.inventory?.portOpeners.filter((p) => p.owned).map((p) => p.name),
    );
    for (const { hostname } of pwnable) {
      if (owned.has(PN.bruteSsh)) ns.brutessh(hostname);
      if (owned.has(PN.ftpCrack)) ns.ftpcrack(hostname);
      if (owned.has(PN.relaySmtp)) ns.relaysmtp(hostname);
      if (owned.has(PN.httpWorm)) ns.httpworm(hostname);
      if (owned.has(PN.sqlInject)) ns.sqlinject(hostname);
      ns.nuke(hostname);
    }
    log.info(`nuked ${pwnable.length} target${pwnable.length === 1 ? "" : "s"}`);
  }, [ns, log, state]);

  const actions = onOpenMap ? (
    <Button onClick={onOpenMap}>
      <WorldIcon color={colors.accent} />
      Server map
    </Button>
  ) : undefined;

  return (
    <Panel title="Servers" actions={actions}>
      <Row gap={space.sm}>
        <span style={{ color: colors.fg }}>
          {playerOwned} owned · {nuked} nuked · {backdoored} backdoored ·
        </span>
        <Spinner active={targets > 0} />
        <span style={{ color: colors.fg }}>{targets} left</span>
      </Row>
    </Panel>
  );
}
