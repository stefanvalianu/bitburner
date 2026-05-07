import { useEffect } from "react";
import { useGameState } from "../gameState";
import { useLogger } from "../log";
import { useNs } from "../ns";
import { Panel } from "./Panel";
import { Row } from "./Row";
import { useTheme } from "./theme";

function Spinner({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const stroke = active ? colors.accent : colors.muted;
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" role="img" aria-hidden>
      <circle
        cx={8}
        cy={8}
        r={6}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray="20 12"
        strokeLinecap="round"
      >
        {active && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 8 8"
            to="360 8 8"
            dur="1s"
            repeatCount="indefinite"
          />
        )}
      </circle>
    </svg>
  );
}

export function ServerPanel() {
  const ns = useNs();
  const log = useLogger("steal");
  const { colors, space } = useTheme();
  const { servers, stats, inventory } = useGameState();

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
      stats.hackingLevel >= s.requiredHackingSkill &&
      ownedPortOpeners >= s.numOpenPortsRequired,
  );

  // Re-runs every gameState tick — `servers` is a fresh array per snapshot,
  // mirroring the cadence used by usePropagate.
  useEffect(() => {
    if (pwnable.length === 0) return;
    let started = 0;
    for (const t of pwnable) {
      const pid = ns.exec("lib/hacks/pwn.js", "home", 1, t.hostname);
      if (pid > 0) started++;
    }
    if (started > 0) log.info(`pwn started on ${started}/${pwnable.length} targets`);
  }, [ns, log, servers, stats.hackingLevel, ownedPortOpeners]);

  return (
    <Panel title="Servers">
      <Row gap={space.sm}>
        <span style={{ color: colors.fg }}>
          {playerOwned} owned · {nuked} nuked · {backdoored} backdoored ·
        </span>
        <Spinner active={targets > 0} />
        <span style={{ color: colors.fg }}>
          {targets} targets ({pwnable.length} valid)
        </span>
      </Row>
    </Panel>
  );
}
