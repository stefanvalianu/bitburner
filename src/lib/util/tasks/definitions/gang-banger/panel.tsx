import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Col } from "../../../../ui/Col";
import { Row } from "../../../../ui/Row";
import { StatRow } from "../../../../ui/StatRow";
import { useTheme } from "../../../../ui/theme";
import { useNs } from "../../../ns";
import { useDashboardController } from "../../../useDashboardController";
import {
  GANG_BANGER_TASK_ID,
  type GangBangerTaskState,
  type GangMember,
  type MemberRank,
} from "./info";
import { TaskCustomPanel } from "../tasks";

const ROMAN: Record<MemberRank, string> = { 1: "I", 2: "II", 3: "III", 4: "IV" };

const TILE_SIZE = 48;
const TILE_FONT_SIZE = 18;

export const GangBangerPanel: TaskCustomPanel = () => {
  const { colors, space } = useTheme();
  const ns = useNs();
  const { state } = useDashboardController();

  const taskState = state.tasks[GANG_BANGER_TASK_ID] as unknown as GangBangerTaskState | undefined;
  const members = taskState?.members ?? [];
  const gang = taskState?.gang;

  const territoryPct = ns.format.number((gang?.territory ?? 0) * 100, 2);

  return (
    <Col gap={space.md}>
      <Row gap={space.lg}>
        <StatRow label="gang" value={gang?.faction ?? "—"} />
        <StatRow label="territory" value={`${territoryPct}%`} valueColor={colors.accent} />
      </Row>
      {members.length === 0 ? (
        <span style={{ color: colors.muted }}>No members yet — waiting for recruits.</span>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm }}>
          {members.map((m) => (
            <MemberTile key={m.info.name} member={m} />
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
  const { colors, fonts } = useTheme();
  const tileRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const isTopRank = member.rank === 4;
  const borderColor = isTopRank ? colors.accent : colors.border;
  const labelColor = isTopRank ? colors.accent : colors.fg;

  return (
    <div
      ref={tileRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: TILE_SIZE,
        height: TILE_SIZE,
        border: `1px solid ${borderColor}`,
        background: colors.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: labelColor,
        fontFamily: fonts.mono,
        fontSize: TILE_FONT_SIZE,
        fontWeight: "bold",
        boxSizing: "border-box",
      }}
    >
      {ROMAN[member.rank]}
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
  const { colors, space } = useTheme();
  const ns = useNs();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const anchor = findFixedContainingBlock(trigger);
    const trigRect = trigger.getBoundingClientRect();
    const anchorRect = anchor?.getBoundingClientRect() ?? { top: 0, left: 0 };
    setPos({
      top: trigRect.top - anchorRect.top - space.xs,
      left: trigRect.left + trigRect.width / 2 - anchorRect.left,
    });
  }, [triggerRef, space.xs]);

  if (!pos) return null;

  const info = member.info;
  const skills: Array<{ label: string; level: number; mult: number; color?: string }> = [
    { label: "hack", level: info.hack, mult: info.hack_asc_mult, color: colors.hack },
    { label: "str", level: info.str, mult: info.str_asc_mult, color: colors.white },
    { label: "def", level: info.def, mult: info.def_asc_mult, color: colors.white },
    { label: "dex", level: info.dex, mult: info.dex_asc_mult, color: colors.white },
    { label: "agi", level: info.agi, mult: info.agi_asc_mult, color: colors.white },
    { label: "cha", level: info.cha, mult: info.cha_asc_mult, color: colors.cha },
  ];

  return (
    <div
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: "translate(-50%, -100%)",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        padding: space.sm,
        minWidth: 240,
        zIndex: 100,
        pointerEvents: "none",
        fontSize: "0.85em",
      }}
    >
      <Col gap={space.xs}>
        <Row gap={space.sm} style={{ justifyContent: "space-between" }}>
          <span style={{ color: colors.fg, fontWeight: "bold" }}>{info.name}</span>
          <span style={{ color: colors.accent }}>rank {ROMAN[member.rank]}</span>
        </Row>
        {skills.map((s) => (
          <StatRow
            key={s.label}
            label={s.label}
            value={`${ns.format.number(s.level, 0)} (asc ×${s.mult.toFixed(2)})`}
            valueColor={s.color}
          />
        ))}
      </Col>
    </div>
  );
}
