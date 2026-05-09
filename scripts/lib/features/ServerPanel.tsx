import { useEffect, useState } from "react";
import { useLogger } from "../util/logging/log";
import { useNs } from "../util/ns";
import {
  hackDifficulty,
  minDifficulty,
  moneyAvailable,
  moneyMax,
  numOpenPortsRequired,
  requiredHackingSkill,
} from "../util/serverMap";
import type { TaskState } from "../util/tasks/types";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { HomeIcon, MoneyIcon, PowerIcon, ShieldIcon, TargetIcon, WorldIcon } from "../ui/Icons";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { Spinner } from "../ui/Spinner";
import { useTheme } from "../ui/theme";
import { SCOUT_SERVER_TASK_ID, ScoutTaskState } from "../util/tasks/definitions/scout-server/info";
import { useDashboardController } from "../util/useDashboardController";

export function ServerPanel({ onOpenMap }: { onOpenMap?: () => void }) {
  const ns = useNs();
  const log = useLogger("servers");
  const { colors, space } = useTheme();
  const { state, shutdownTask } = useDashboardController();
  const [confirmStopId, setConfirmStopId] = useState<string | null>(null);

  /*
  const scoutSlot = taskState.tasks[SCOUT_SERVER_TASK_ID] as TaskState<ScoutTaskState> | undefined;
  const targetServer = scoutSlot?.target
    ? servers.find((s) => s.hostname === scoutSlot.target)
    : undefined;
*/

  /*
  // Categorize once. Backdoored implies admin rights, so the nuked bucket
  // excludes backdoored to avoid double-counting. Player-owned is its own
  // bucket — purchased servers always have admin rights but shouldn't inflate
  // the nuked/backdoored tallies. "Targets" is the leftover: everything not
  // yet nuked and not player-owned, regardless of whether we can pwn it now.
  const playerOwned = servers.filter((s) => s.purchasedByPlayer).length;
  const backdoored = servers.filter((s) => s.backdoorInstalled && !s.purchasedByPlayer).length;
  const nuked = servers.filter(
    (s) => s.hasAdminRights && !s.backdoorInstalled && !s.purchasedByPlayer,
  ).length;
  const targets = servers.length - playerOwned - nuked - backdoored;

  const ownedPortOpeners = inventory.portOpeners.filter((p) => p.owned).length;

  const pwnable = servers.filter(
    (s) =>
      !s.hasAdminRights &&
      !s.purchasedByPlayer &&
      stats.hackingLevel >= requiredHackingSkill(s) &&
      ownedPortOpeners >= numOpenPortsRequired(s),
  );

  // NUKE every pwnable server every gameState tick. The port-opener calls
  // throw if the corresponding .exe isn't owned, so we gate each one on
  // inventory. NUKE itself is unconditional — the pwnable filter already
  // confirmed admin rights are missing and the requirements are met.
  useEffect(() => {
    if (pwnable.length === 0) return;
    const PN = ns.enums.ProgramName;
    const owned = new Set(inventory.portOpeners.filter((p) => p.owned).map((p) => p.name));
    for (const { hostname } of pwnable) {
      if (owned.has(PN.bruteSsh)) ns.brutessh(hostname);
      if (owned.has(PN.ftpCrack)) ns.ftpcrack(hostname);
      if (owned.has(PN.relaySmtp)) ns.relaysmtp(hostname);
      if (owned.has(PN.httpWorm)) ns.httpworm(hostname);
      if (owned.has(PN.sqlInject)) ns.sqlinject(hostname);
      ns.nuke(hostname);
    }
    log.info(`nuked ${pwnable.length} target${pwnable.length === 1 ? "" : "s"}`);
  }, [ns, log, servers, stats.hackingLevel, ownedPortOpeners, inventory.portOpeners]);

  const actions = onOpenMap ? (
    <Button onClick={onOpenMap}>
      <WorldIcon color={colors.accent} />
      Server map
    </Button>
  ) : undefined;

  // Show only running/stopping slots — idle ones don't need a row.
  const liveTasks = Object.entries(taskState.tasks).filter(
    ([, slot]) => slot.status === "running" || slot.status === "stopping",
  );

  return (
    <Panel title="Servers" actions={actions}>
      <Row gap={space.sm}>
        <span style={{ color: colors.fg }}>
          {playerOwned} owned · {nuked} nuked · {backdoored} backdoored ·
        </span>
        <Spinner active={targets > 0} />
        <span style={{ color: colors.fg }}>
          {targets} targets ({pwnable.length} valid)
        </span>
      </Row>
      {targetServer && (
        <Row gap={space.sm}>
          <TargetIcon color={colors.accent} title={`Active target: ${targetServer.hostname}`} />
          <span style={{ color: colors.fg }}>{targetServer.hostname}</span>
          <MoneyIcon color={colors.money} />
          <span style={{ color: colors.muted }}>
            ${ns.format.number(moneyAvailable(targetServer))}/$
            {ns.format.number(moneyMax(targetServer))}
          </span>
          <ShieldIcon color={colors.hack} />
          <span style={{ color: colors.muted }}>
            {hackDifficulty(targetServer).toFixed(2)}/{minDifficulty(targetServer).toFixed(2)}
          </span>
        </Row>
      )}
      {liveTasks.map(([id, slot]) => {
        const slices = slot.lastAllocation?.servers ?? [];
        const ram = slices.reduce((sum, s) => sum + s.ram, 0);
        const suffix = slot.status === "stopping" ? " (stopping)" : "";
        const canStop = slot.status === "running";
        return (
          <Row key={id} gap={space.sm}>
            <HomeIcon color={colors.accent} title={`Controller host: ${slot.host}`} />
            <span
              style={{
                fontFamily: "serif",
                fontStyle: "italic",
                color: colors.fg,
              }}
            >
              {slot.host}
            </span>
            <span style={{ color: colors.muted }}>
              {id}: {slices.length} hosts / {ram}GB{suffix}
            </span>
            {canStop && (
              <span style={{ marginLeft: "auto" }}>
                <Button onClick={() => setConfirmStopId(id)} variant="warn">
                  <PowerIcon color={colors.warn} title={`Stop ${id}`} />
                  Stop
                </Button>
              </span>
            )}
          </Row>
        );
      })}
      <ConfirmDialog
        open={confirmStopId !== null}
        title="Stop task?"
        message={
          confirmStopId
            ? `Request shutdown of "${confirmStopId}"? Its workers will wind down on their next yield.`
            : ""
        }
        confirmLabel="Stop"
        confirmVariant="warn"
        onCancel={() => setConfirmStopId(null)}
        onConfirm={() => {
          if (confirmStopId) requestShutdown(confirmStopId);
          setConfirmStopId(null);
        }}
      />
    </Panel>
  );*/

  return <Panel title="Servers">Let's bring it back</Panel>;
}
