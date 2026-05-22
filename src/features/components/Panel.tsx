import { useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "@repo/features/theme/ThemeProvider";

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
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const showHeader = title !== undefined || actions !== undefined;
  const showBody = !collapsible || open;

  return (
    <div
      style={{
        fontFamily: theme.font.face,
        color: theme.colors.primary,
        border: `1px solid ${theme.colors.welllight}`,
        padding: theme.spacing.md,
        background: theme.colors.backgroundsecondary,
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing.sm,
        minWidth: 280,
        ...style,
      }}
    >
      {showHeader && (
        <div
          onClick={collapsible ? () => setOpen((o) => !o) : undefined}
          style={{
            fontWeight: "bold",
            color: theme.colors.primary,
            paddingBottom: theme.spacing.xs,
            borderBottom: `1px solid ${theme.colors.primarydark}`,
            cursor: collapsible ? "pointer" : undefined,
            userSelect: collapsible ? "none" : undefined,
            display: "flex",
            alignItems: "center",
            gap: theme.spacing.sm,
          }}
        >
          {collapsible && <Chevron open={open} />}
          {title}
          {actions && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: theme.spacing.sm }}
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
  const theme = useTheme();
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      stroke={theme.colors.primary}
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
