import type { CSSProperties, ReactNode } from "react";
import { colors, fonts, space } from "./tokens";

const base: CSSProperties = { fontFamily: fonts.mono, color: colors.fg };

interface PanelProps {
  title?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}
export function Panel({ title, children, style }: PanelProps) {
  return (
    <div
      style={{
        ...base,
        border: `1px solid ${colors.border}`,
        padding: space.md,
        background: colors.surface,
        display: "flex",
        flexDirection: "column",
        gap: space.sm,
        minWidth: 280,
        ...style,
      }}
    >
      {title !== undefined && (
        <div style={{ fontWeight: "bold", color: colors.fg, paddingBottom: space.xs, borderBottom: `1px solid ${colors.fgDim}` }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

interface FlexProps {
  children: ReactNode;
  gap?: number;
  align?: CSSProperties["alignItems"];
  style?: CSSProperties;
}
export function Row({ children, gap = space.md, align = "center", style }: FlexProps) {
  return <div style={{ ...base, display: "flex", flexDirection: "row", gap, alignItems: align, ...style }}>{children}</div>;
}
export function Col({ children, gap = space.sm, align, style }: FlexProps) {
  return <div style={{ ...base, display: "flex", flexDirection: "column", gap, alignItems: align, ...style }}>{children}</div>;
}

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}
export function Stat({ label, value, color = colors.fg }: StatProps) {
  return (
    <Row gap={space.sm}>
      <span style={{ color: colors.muted }}>{label}:</span>
      <span style={{ color }}>{value}</span>
    </Row>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "warn" | "error";
}
export function Button({ children, onClick, variant = "default" }: ButtonProps) {
  const c = variant === "warn" ? colors.warn : variant === "error" ? colors.error : colors.fg;
  return (
    <button
      onClick={onClick}
      style={{
        ...base,
        background: colors.bg,
        color: c,
        border: `1px solid ${c}`,
        padding: `${space.xs}px ${space.md}px`,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

interface BadgeProps {
  children: ReactNode;
  color?: string;
}
export function Badge({ children, color = colors.fg }: BadgeProps) {
  return (
    <span style={{ ...base, color, border: `1px solid ${color}`, padding: `0 ${space.sm}px`, fontSize: 11 }}>
      {children}
    </span>
  );
}
