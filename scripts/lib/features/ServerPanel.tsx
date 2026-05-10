import { useEffect, useState } from "react";
import { useLogger } from "../util/logging/log";
import { useNs } from "../util/ns";
import { Button } from "../ui/Button";
import { WorldIcon } from "../ui/Icons";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { Spinner } from "../ui/Spinner";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { Modal } from "../ui/Modal";
import { ServerMapDialog } from "./ServerMapDialog";

export function ServerPanel() {
  const ns = useNs();
  const log = useLogger("server-panel");
  const { colors, space } = useTheme();
  const { state } = useDashboardController();

  const [modalOpen, setModalOpen] = useState<boolean>(false);

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

  // Greedily try to nuke every server that might be nukable
  useEffect(() => {
    const targets = state.allServers.filter((s) => !s.hasAdminRights && !s.purchasedByPlayer);

    let pwned: string[] = [];

    for (const target of targets) {
      ns.brutessh(target.hostname);
      ns.ftpcrack(target.hostname);
      ns.relaysmtp(target.hostname);
      ns.httpworm(target.hostname);
      ns.sqlinject(target.hostname);
      if (ns.nuke(target.hostname)) {
        pwned.push(target.hostname);
      }
    }

    if (pwned.length > 0) {
      log.info(`nuked ${pwned.length} target${pwned.length === 1 ? "" : "s"}: ${pwned.join(", ")}`);
    }
  }, [ns, log, state.tick]);

  return (
    <>
      <Panel
        title="Servers"
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <WorldIcon color={colors.accent} />
            Server map
          </Button>
        }
      >
        <Row gap={space.sm}>
          <span style={{ color: colors.fg }}>
            {playerOwned} owned · {nuked} nuked · {backdoored} backdoored
          </span>
          { targets > 0 &&
          <>
            <Spinner active />
            <span style={{ color: colors.fg }}>{targets} left</span>
          </>
          }
        </Row>
      </Panel>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Map"
        style={{ minWidth: 800, maxWidth: "calc(90vw - 16px)" }}
      >
        <ServerMapDialog />
      </Modal>
    </>
  );
}
