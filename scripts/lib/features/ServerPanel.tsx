import { useEffect, useMemo, useState } from "react";
import { useLogger } from "../util/logging/log";
import { useNs } from "../util/ns";
import { Button } from "../ui/Button";
import { Col } from "../ui/Col";
import { Hint } from "../ui/Hint";
import { HardwareIcon, HomeIcon, WorldIcon } from "../ui/Icons";
import { NumberInput } from "../ui/NumberInput";
import { Panel } from "../ui/Panel";
import { Row } from "../ui/Row";
import { SectionHeading } from "../ui/SectionHeading";
import { Spinner } from "../ui/Spinner";
import { StatRow } from "../ui/StatRow";
import { useTheme } from "../ui/theme";
import { useDashboardController } from "../util/useDashboardController";
import { usePreferences } from "../util/usePreferences";
import { Modal } from "../ui/Modal";
import { ServerMapDialog } from "./ServerMapDialog";
import { SERVER_PURCHASE_COMMUNICATION_PORT } from "../util/ports";
import { getPlayerMonitorState } from "../util/tasks/definitions/player-monitor/info";
import {
  CLOUD_SERVER_PREFIX,
  getServerBuyerState,
  type PurchasePreference,
  type ServerPurchaseRequest,
} from "../util/tasks/definitions/server-buyer/info";

// Servers are named `${CLOUD_SERVER_PREFIX}-N` — strip the prefix + dash to
// recover the numeric suffix.
const CLOUD_OFFSET = CLOUD_SERVER_PREFIX.length + 1;
const cloudSuffix = (hostname: string): string => hostname.slice(CLOUD_OFFSET);

export function ServerPanel() {
  const ns = useNs();
  const log = useLogger("server-panel");
  const { colors, space } = useTheme();
  const { state } = useDashboardController();

  const [mapOpen, setMapOpen] = useState<boolean>(false);
  const [buyOpen, setBuyOpen] = useState<boolean>(false);

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
      return Number(cloudSuffix(a.hostname)) - Number(cloudSuffix(b.hostname));
    });
  }, [state.allServers]);

  // Empty-slot count comes from the buyer task's published max. When the task
  // hasn't reported yet (or isn't running), don't render placeholders.
  const buyer = getServerBuyerState(state);
  const purchasedCount = ownedSorted.filter((s) => s.hostname !== "home").length;
  const emptySlots = buyer ? Math.max(0, buyer.maxCloudServers - purchasedCount) : 0;

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
          <Row gap={space.sm}>
            <Button onClick={() => setBuyOpen(true)} disabled={!buyer}>
              <HardwareIcon color={colors.accent} title="Buy or upgrade a server" />
              Buy
            </Button>
            <Button onClick={() => setMapOpen(true)}>
              <WorldIcon color={colors.accent} />
              Server map
            </Button>
          </Row>
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
            {Array.from({ length: emptySlots }).map((_, i) => (
              <EmptyServerTile key={`empty-${i}`} />
            ))}
          </div>
        </Col>
      </Panel>
      <Modal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title="Map"
        style={{ minWidth: 800, maxWidth: "calc(90vw - 16px)" }}
      >
        <ServerMapDialog />
      </Modal>
      <BuyServerModal open={buyOpen} onClose={() => setBuyOpen(false)} />
    </>
  );
}

const TILE_SIZE = 32;
const TILE_ICON_SIZE = 18;
const TILE_FONT_SIZE = 14;

function ServerTile({ hostname }: { hostname: string }) {
  const { colors, fonts } = useTheme();
  const isHome = hostname === "home";
  const label = isHome ? null : cloudSuffix(hostname);
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
        fontSize: TILE_FONT_SIZE,
        fontWeight: "bold",
        boxSizing: "border-box",
      }}
    >
      {isHome ? <HomeIcon color={colors.fg} size={TILE_ICON_SIZE} /> : label}
    </div>
  );
}

function EmptyServerTile() {
  const { colors } = useTheme();
  return (
    <div
      title="Empty slot — buy a server to fill"
      style={{
        width: TILE_SIZE,
        height: TILE_SIZE,
        border: `1px solid ${colors.well}`,
        background: "transparent",
        boxSizing: "border-box",
      }}
    />
  );
}

interface BuyServerModalProps {
  open: boolean;
  onClose: () => void;
}

function BuyServerModal({ open, onClose }: BuyServerModalProps) {
  const { colors, space } = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();
  const { preferences } = usePreferences();

  const [preference, setPreference] = useState<PurchasePreference>("auto");
  const [budgetInput, setBudgetInput] = useState<string>("");

  const money = getPlayerMonitorState(state)?.player?.money ?? 0;
  const reserved = preferences.reservedMoney;
  const spendable = Math.max(0, money - reserved);

  // Mirrors the server-buyer task's resolution: a blank input falls back to
  // spendable; otherwise it's max(requestedBudget, spendable) so the task
  // can spend everything available even if the user under-asked.
  const parsedBudget = Number(budgetInput);
  const hasBudget = budgetInput.trim() !== "" && Number.isFinite(parsedBudget) && parsedBudget > 0;
  const effectiveBudget = hasBudget ? Math.max(parsedBudget, spendable) : spendable;

  const submit = () => {
    const request: ServerPurchaseRequest = { preference };
    if (hasBudget) request.budget = parsedBudget;
    ns.writePort(SERVER_PURCHASE_COMMUNICATION_PORT, JSON.stringify(request));
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Buy server"
      actions={
        <Row gap={space.md} style={{ alignItems: "center" }}>
          <Hint>Effective budget</Hint>
          <span
            style={{
              color: colors.money,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ${ns.format.number(effectiveBudget, 2)}
          </span>
          <Button onClick={submit}>Send request</Button>
        </Row>
      }
    >
      <Col gap={space.lg}>
        <Col gap={space.sm}>
          <SectionHeading>Funds</SectionHeading>
          <Row gap={space.lg}>
            <StatRow
              label="Available"
              value={`$${ns.format.number(money, 2)}`}
              valueColor={colors.money}
            />
            <StatRow label="Reserved" value={`$${ns.format.number(reserved, 2)}`} />
          </Row>
        </Col>

        <Col gap={space.sm}>
          <SectionHeading>Preference</SectionHeading>
          <Row gap={space.md}>
            <PreferenceRadio
              value="auto"
              current={preference}
              onChange={setPreference}
              label="Auto"
              hint="Pick the best cost/GB across upgrades and new buys."
            />
            <PreferenceRadio
              value="upgrade"
              current={preference}
              onChange={setPreference}
              label="Upgrade"
              hint="Only upgrade existing servers."
            />
            <PreferenceRadio
              value="new"
              current={preference}
              onChange={setPreference}
              label="New"
              hint="Only buy new servers (up to the cap)."
            />
          </Row>
        </Col>

        <Col gap={space.sm}>
          <SectionHeading>Budget (optional)</SectionHeading>
          <Row gap={space.sm} style={{ alignItems: "center" }}>
            <span style={{ color: colors.muted }}>$</span>
            <NumberInput
              value={budgetInput}
              onChange={setBudgetInput}
              placeholder="leave blank for all spendable"
            />
          </Row>
          <Hint>Cap on this purchase. Blank = use all money above the reserved threshold.</Hint>
        </Col>
      </Col>
    </Modal>
  );
}

interface PreferenceRadioProps {
  value: PurchasePreference;
  current: PurchasePreference;
  onChange: (v: PurchasePreference) => void;
  label: string;
  hint: string;
}

function PreferenceRadio({ value, current, onChange, label, hint }: PreferenceRadioProps) {
  const { colors, space } = useTheme();
  const checked = value === current;
  return (
    <label
      title={hint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: space.xs,
        cursor: "pointer",
      }}
    >
      <input
        type="radio"
        name="purchase-preference"
        checked={checked}
        onChange={() => onChange(value)}
        style={{ accentColor: colors.accent, cursor: "pointer" }}
      />
      <span style={{ color: colors.fg }}>{label}</span>
    </label>
  );
}
