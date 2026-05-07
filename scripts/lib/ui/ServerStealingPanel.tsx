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

export function ServerStealingPanel() {
  const ns = useNs();
  const log = useLogger("steal");
  const { colors, space } = useTheme();
  const { servers, stats, inventory } = useGameState();

  const total = servers.length;
  const backdoored = servers.filter((s) => s.backdoorInstalled || s.purchasedByPlayer).length;
  const active = backdoored < total;

  const ownedPortOpeners = inventory.portOpeners.filter((p) => p.owned).length;

  const targets = servers.filter(
    (s) =>
      !s.backdoorInstalled &&
      !s.purchasedByPlayer &&
      stats.hackingLevel >= s.requiredHackingSkill &&
      ownedPortOpeners >= s.numOpenPortsRequired,
  );

  // Re-runs every gameState tick — `servers` is a fresh array per snapshot,
  // mirroring the cadence used by usePropagate.
  useEffect(() => {
    if (targets.length === 0) return;
    let started = 0;
    for (const t of targets) {
      const pid = ns.exec("lib/hacks/pwn.js", "home", 1, t.hostname);
      if (pid > 0) started++;
    }
    if (started > 0) log.info(`pwn started on ${started}/${targets.length} targets`);
  }, [ns, log, servers, stats.hackingLevel, ownedPortOpeners]);

  return (
    <Panel title="Server stealing">
      <Row gap={space.sm}>
        <Spinner active={active} />
        <span style={{ color: colors.fg }}>
          {backdoored} / {total} backdoored · {targets.length} ready to pwn
        </span>
      </Row>
    </Panel>
  );
}
