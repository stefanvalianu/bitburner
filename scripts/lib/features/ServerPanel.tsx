import { useEffect, useMemo, useState } from "react";
import { useLogger } from "../util/logging/log";
import { useNs } from "../util/ns";
import { Button } from "../ui/Button";
import { Col } from "../ui/Col";
import { HomeIcon, WorldIcon } from "../ui/Icons";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { Spinner } from "../ui/Spinner";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { Modal } from "../ui/Modal";
import { ServerMapDialog } from "./ServerMapDialog";
import { CLOUD_SERVER_PREFIX } from "../util/tasks/definitions/server-buyer/task";

export function ServerPanel() {
  const ns = useNs();
  const log = useLogger("server-panel");
  const { colors, space } = useTheme();
  const { state } = useDashboardController();

  const [modalOpen, setModalOpen] = useState<boolean>(false);

  // Player-owned servers always have admin rights, so they're excluded from
  // the "X/Y nuked" tally — the meaningful denominator is "things we had to
  // pwn." Backdoored implies admin rights, so it's already folded into X.
  const nukeable = state.allServers.filter((s) => !s.purchasedByPlayer);
  const nukedCount = nukeable.filter((s) => s.hasAdminRights).length;
  const nukeableTotal = nukeable.length;
  const stillNuking = nukedCount < nukeableTotal;

  // Home first, then cloud-# in numeric order. cloud-2 before cloud-10.
  const ownedSorted = useMemo(() => {
    const owned = state.allServers.filter((s) => s.purchasedByPlayer);
    return [...owned].sort((a, b) => {
      if (a.hostname === "home") return -1;
      if (b.hostname === "home") return 1;
      const na = Number(a.hostname.slice(CLOUD_SERVER_PREFIX.length));
      const nb = Number(b.hostname.slice(CLOUD_SERVER_PREFIX.length));
      return na - nb;
    });
  }, [state.allServers]);

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
        <Col gap={space.md}>
          <Row gap={space.sm} style={{ alignItems: "center" }}>
            <span style={{ color: colors.fg }}>
              {nukedCount}/{nukeableTotal} nuked
            </span>
            {stillNuking && <Spinner active />}
          </Row>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm }}>
            {ownedSorted.map((s) => (
              <ServerTile key={s.hostname} hostname={s.hostname} />
            ))}
          </div>
        </Col>
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

const TILE_SIZE = 64;

function ServerTile({ hostname }: { hostname: string }) {
  const { colors, fonts } = useTheme();
  const isHome = hostname === "home";
  const label = isHome ? null : hostname.slice(CLOUD_SERVER_PREFIX.length);
  return (
    <div
      title={hostname}
      style={{
        width: TILE_SIZE,
        height: TILE_SIZE,
        border: `1px solid ${colors.border}`,
        background: colors.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: colors.fg,
        fontFamily: fonts.mono,
        fontSize: 20,
        fontWeight: "bold",
        boxSizing: "border-box",
      }}
    >
      {isHome ? <HomeIcon color={colors.fg} size={32} /> : label}
    </div>
  );
}
