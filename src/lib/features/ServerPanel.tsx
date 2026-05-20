import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useLogger } from "../util/logging/log";
import { Button } from "../../features/components/Button";
import { Col } from "../../features/components/Col";
import { Hint } from "../../features/components/Hint";
import { HardwareIcon, HomeIcon, WorldIcon } from "../../features/components/Icons";
import { NumberInput } from "../../features/components/NumberInput";
import { Panel } from "../../features/components/Panel";
import { Row } from "../../features/components/Row";
import { SectionHeading } from "../../features/components/SectionHeading";
import { Spinner } from "../../features/components/Spinner";
import { StatRow } from "../../features/components/StatRow";
import { useDashboardController } from "../util/useDashboardController";
import { usePreferences } from "../util/usePreferences";
import { Modal } from "../../features/components/Modal";
import { ServerMapDialog } from "./ServerMapDialog";
import { SERVER_PURCHASE_COMMUNICATION_PORT } from "../util/ports";
import { getPlayerMonitorState } from "../util/tasks/definitions/player-monitor/info";
import {
  CLOUD_SERVER_PREFIX,
  getServerBuyerState,
  type CloudServerInfo,
  type PurchasePreference,
  type ServerPurchaseRequest,
} from "../util/tasks/definitions/server-buyer/info";
import { useNs } from "../../features/ns/NsProvider";
import { useTheme } from "../../features/theme/ThemeProvider";

// Servers are named `${CLOUD_SERVER_PREFIX}-N` — strip the prefix + dash to
// recover the numeric suffix.
const CLOUD_OFFSET = CLOUD_SERVER_PREFIX.length + 1;
const cloudSuffix = (hostname: string): string => hostname.slice(CLOUD_OFFSET);

export function ServerPanel() {
  const ns = useNs();
  const log = useLogger("server-panel");
  const theme = useTheme();
  const { state } = useDashboardController();

  const [mapOpen, setMapOpen] = useState<boolean>(false);
  const [buyOpen, setBuyOpen] = useState<boolean>(false);

  // Player-owned servers always have admin rights, so they're excluded from
  // the "X/Y nuked" tally — the meaningful denominator is "things we had to
  // pwn." Backdoored implies admin rights, so it's already folded into X.
  const nukeable = state.allServers.filter((s) => !s.purchasedByPlayer);
  const nukedCount = nukeable.filter((s) => s.hasAdminRights).length;
  const nukeableTotal = nukeable.length;

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

  // Lookup map of cloud-server info by hostname so each tile can color/tooltip
  // itself based on current upgrade affordability.
  const cloudInfoByHost = useMemo(() => {
    const m = new Map<string, CloudServerInfo>();
    if (buyer && buyer.cloudServers) for (const c of buyer.cloudServers) m.set(c.hostname, c);
    return m;
  }, [buyer]);

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
          <Row gap={theme.spacing.sm}>
            <span style={{ color: theme.colors.secondary, fontSize: "0.85em" }}>
              {nukedCount}/{nukeableTotal} nuked
            </span>
            <Button onClick={() => setBuyOpen(true)} disabled={!buyer}>
              <HardwareIcon color={theme.colors.info} title="Buy or upgrade a server" />
              Buy
            </Button>
            <Button onClick={() => setMapOpen(true)}>
              <WorldIcon color={theme.colors.info} />
              Server map
            </Button>
          </Row>
        }
      >
        <SectionHeading>Player servers</SectionHeading>
        <Col gap={theme.spacing.md}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: theme.spacing.sm }}>
            {ownedSorted.map((s) => (
              <ServerTile
                key={s.hostname}
                hostname={s.hostname}
                cloudInfo={cloudInfoByHost.get(s.hostname)}
                ramGB={s.maxRam}
              />
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <EmptyServerTile key={`empty-${i}`} />
            ))}
          </div>
          {!buyer && <Spinner active label="Loading server purchase & upgrade info…" />}
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

const TILE_SIZE = 48;
const TILE_ICON_SIZE = 24;
const TILE_FONT_SIZE = 18;

interface ServerTileProps {
  hostname: string;
  cloudInfo?: CloudServerInfo;
  ramGB: number;
}

function ServerTile({ hostname, cloudInfo, ramGB }: ServerTileProps) {
  const theme = useTheme();
  const tileRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const isHome = hostname === "home";
  const label = isHome ? null : cloudSuffix(hostname);

  // A cloud server is "upgradeable" while the buyer task can still grow it.
  // maxUpgradeCost = -1 means it's already at the cap (or info missing).
  const upgradeable = cloudInfo !== undefined && cloudInfo.maxUpgradeCost !== -1;
  const accent = upgradeable ? theme.colors.info : theme.colors.primary;

  return (
    <div
      ref={tileRef}
      title={upgradeable ? undefined : hostname}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: TILE_SIZE,
        height: TILE_SIZE,
        border: `1px solid ${upgradeable ? theme.colors.info : theme.colors.welllight}`,
        background: theme.colors.backgroundsecondary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: accent,
        fontFamily: theme.font.face,
        fontSize: TILE_FONT_SIZE,
        fontWeight: "bold",
        boxSizing: "border-box",
      }}
    >
      {isHome ? <HomeIcon color={accent} size={TILE_ICON_SIZE} /> : label}
      {upgradeable && hovered && cloudInfo && (
        <UpgradeTooltip cloudInfo={cloudInfo} ramGB={ramGB} triggerRef={tileRef} />
      )}
    </div>
  );
}

// CSS `position: fixed` is contained by the nearest ancestor that creates a
// containing block for it — `transform`, `perspective`, `filter`, etc. on an
// ancestor pin it there instead of the viewport. Bitburner's tail-window root
// has a transform, so fixed elements anchor to the tail window. We need that
// ancestor's bounds to translate viewport coords (from getBoundingClientRect)
// into the fixed element's coordinate space.
function findFixedContainingBlock(el: HTMLElement): HTMLElement | null {
  const view = el.ownerDocument.defaultView;
  if (!view) return null;
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const cs = view.getComputedStyle(cur);
    if (cs.transform !== "none" || cs.perspective !== "none" || cs.filter !== "none") {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

interface UpgradeTooltipProps {
  cloudInfo: CloudServerInfo;
  ramGB: number;
  triggerRef: RefObject<HTMLDivElement>;
}

function UpgradeTooltip({ cloudInfo, ramGB, triggerRef }: UpgradeTooltipProps) {
  const theme = useTheme();
  const ns = useNs();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position via `getBoundingClientRect` so the tooltip can use
  // `position: fixed` and escape the dashboard's `overflow: auto` scroll
  // container. `position: absolute` would be clipped by it.
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const anchor = findFixedContainingBlock(trigger);
    const trigRect = trigger.getBoundingClientRect();
    const anchorRect = anchor?.getBoundingClientRect() ?? { top: 0, left: 0 };
    setPos({
      top: trigRect.top - anchorRect.top - theme.spacing.xs,
      left: trigRect.left + trigRect.width / 2 - anchorRect.left,
    });
  }, [triggerRef, theme.spacing.xs]);

  const nextCost =
    cloudInfo.nextUpgradeCost !== -1 ? `$${ns.format.number(cloudInfo.nextUpgradeCost, 2)}` : "—";
  const maxCost = `$${ns.format.number(cloudInfo.maxUpgradeCost, 2)}`;

  if (!pos) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: "translate(-50%, -100%)",
        background: theme.colors.backgroundsecondary,
        border: `1px solid ${theme.colors.welllight}`,
        padding: theme.spacing.sm,
        minWidth: 200,
        zIndex: 100,
        pointerEvents: "none",
        fontSize: "0.85em",
      }}
    >
      <Col gap={theme.spacing.xs}>
        <span style={{ color: theme.colors.secondary }}>{cloudInfo.hostname}</span>
        <StatRow label="RAM" value={ns.format.ram(ramGB)} />
        <StatRow label="Next upgrade" value={nextCost} valueColor={theme.colors.money} />
        <StatRow label="To max" value={maxCost} valueColor={theme.colors.money} />
      </Col>
    </div>
  );
}

function EmptyServerTile() {
  const theme = useTheme();
  return (
    <div
      title="Empty slot — buy a server to fill"
      style={{
        width: TILE_SIZE,
        height: TILE_SIZE,
        border: `1px solid ${theme.colors.well}`,
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
  const theme = useTheme();
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
        <Row gap={theme.spacing.md} style={{ alignItems: "center" }}>
          <Hint>Effective budget</Hint>
          <span
            style={{
              color: theme.colors.money,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ${ns.format.number(effectiveBudget, 2)}
          </span>
          <Button onClick={submit} disabled={effectiveBudget === 0}>
            Send request
          </Button>
        </Row>
      }
    >
      <Col gap={theme.spacing.lg}>
        <Col gap={theme.spacing.sm}>
          <SectionHeading>Funds</SectionHeading>
          <Row gap={theme.spacing.lg}>
            <StatRow
              label="Available"
              value={`$${ns.format.number(money, 2)}`}
              valueColor={theme.colors.money}
            />
            <StatRow label="Reserved" value={`$${ns.format.number(reserved, 2)}`} />
          </Row>
        </Col>

        <Col gap={theme.spacing.sm}>
          <SectionHeading>Budget (optional)</SectionHeading>
          <Row gap={theme.spacing.sm} style={{ alignItems: "center" }}>
            <span style={{ color: theme.colors.secondary }}>$</span>
            <NumberInput value={budgetInput} onChange={setBudgetInput} placeholder="spending cap" />
          </Row>
        </Col>

        <Col gap={theme.spacing.sm}>
          <SectionHeading>Preference</SectionHeading>
          <Row gap={theme.spacing.md}>
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
  const theme = useTheme();
  const checked = value === current;
  return (
    <label
      title={hint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: theme.spacing.xs,
        cursor: "pointer",
      }}
    >
      <input
        type="radio"
        name="purchase-preference"
        checked={checked}
        onChange={() => onChange(value)}
        style={{ accentColor: theme.colors.info, cursor: "pointer" }}
      />
      <span style={{ color: theme.colors.primary }}>{label}</span>
    </label>
  );
}
