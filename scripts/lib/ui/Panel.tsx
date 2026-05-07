import { useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "./theme";

interface PanelProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function Panel({
  title,
  actions,
  children,
  style,
  collapsible = false,
  defaultOpen = true,
}: PanelProps) {
  const { colors, fonts, space } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const showHeader = title !== undefined || actions !== undefined;
  const showBody = !collapsible || open;

  return (
    <div
      style={{
        fontFamily: fonts.mono,
        color: colors.fg,
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
      {showHeader && (
        <div
          onClick={collapsible ? () => setOpen((o) => !o) : undefined}
          style={{
            fontWeight: "bold",
            color: colors.fg,
            paddingBottom: space.xs,
            borderBottom: `1px solid ${colors.fgDim}`,
            cursor: collapsible ? "pointer" : undefined,
            userSelect: collapsible ? "none" : undefined,
            display: "flex",
            alignItems: "center",
            gap: space.sm,
          }}
        >
          {collapsible && <Chevron open={open} />}
          {title}
          {actions && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: space.sm }}
            >
              {actions}
            </div>
          )}
        </div>
      )}
      {showBody && children}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  const { colors } = useTheme();
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      stroke={colors.fg}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 120ms ease",
      }}
      aria-hidden
    >
      <path d="M3 2 L7 5 L3 8" />
    </svg>
  );
}
