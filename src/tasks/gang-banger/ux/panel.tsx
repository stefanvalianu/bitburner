import { GangMember, GangInfo } from "@repo/common/info/gangInfo";
import { GANG_INFO_PORT, getPortData } from "@repo/common/ports";
import { Col } from "@repo/features/components/Col";
import { Row } from "@repo/features/components/Row";
import { StatRow } from "@repo/features/components/StatRow";
import { useNs } from "@repo/features/ns/NsProvider";
import { useTheme } from "@repo/features/theme/ThemeProvider";
import { TaskCustomPanel } from "@repo/tasks";
import { useRef, useState, RefObject, useLayoutEffect } from "react";

const TILE_SIZE = 24;

export const GangBangerPanel: TaskCustomPanel = () => {
  const theme = useTheme();
  const ns = useNs();

  const gangInfo = getPortData<GangInfo>(ns, GANG_INFO_PORT);

  const members = gangInfo?.members ?? [];

  const territoryPct = ns.format.number((gangInfo?.territory ?? 0) * 100, 2);

  return (
    <Col gap={theme.spacing.md}>
      <Row gap={theme.spacing.sm}>
        <StatRow label="territory" value={`${territoryPct}%`} valueColor={theme.colors.info} />
      </Row>
      {members.length === 0 ? (
        <span style={{ color: theme.colors.secondary }}>No members yet — waiting for recruits.</span>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {members.map((m) => (
            <MemberTile key={m.name} member={m} />
          ))}
        </div>
      )}
    </Col>
  );
};

interface MemberTileProps {
  member: GangMember;
}

function MemberTile({ member }: MemberTileProps) {
  const theme = useTheme();
  const tileRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={tileRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: TILE_SIZE,
        height: TILE_SIZE,
        border: `1px solid ${theme.colors.welllight}`,
        background: theme.colors.backgroundsecondary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme.colors.primary,
        boxSizing: "border-box",
      }}
    >
      {hovered && <MemberTooltip member={member} triggerRef={tileRef} />}
    </div>
  );
}

// Duplicate of ServerPanel.tsx's findFixedContainingBlock. Bitburner's tail
// window has a CSS transform on a parent, which makes `position: fixed` anchor
// to that ancestor instead of the viewport. We need that ancestor's rect to
// translate viewport coords (from getBoundingClientRect) into the fixed
// element's coordinate space. If a third caller appears, extract.
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

interface MemberTooltipProps {
  member: GangMember;
  triggerRef: RefObject<HTMLDivElement>;
}

function MemberTooltip({ member, triggerRef }: MemberTooltipProps) {
  const theme = useTheme();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

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
        minWidth: 240,
        zIndex: 100,
        pointerEvents: "none",
        fontSize: "0.85em",
      }}
    >
      <Col gap={theme.spacing.xs}>
        <Row gap={theme.spacing.sm} style={{ justifyContent: "space-between" }}>
          <span style={{ color: theme.colors.primary, fontWeight: "bold" }}>{member.name}</span>
        </Row>
      </Col>
    </div>
  );
}
