import { useState } from "react";
import { useTheme } from "./theme";

interface JsonViewProps {
  value: unknown;
  defaultExpandDepth?: number;
}

export function JsonView({ value, defaultExpandDepth = 1 }: JsonViewProps) {
  const { fonts } = useTheme();
  return (
    <div style={{ fontFamily: fonts.mono, fontSize: 12, lineHeight: 1.5 }}>
      <Node value={value} depth={0} expandDepth={defaultExpandDepth} />
    </div>
  );
}

function Node({
  value,
  depth,
  expandDepth,
}: {
  value: unknown;
  depth: number;
  expandDepth: number;
}) {
  const { colors, space } = useTheme();
  const [open, setOpen] = useState(depth < expandDepth);

  if (value === null) return <span style={{ color: colors.muted }}>null</span>;
  if (value === undefined) return <span style={{ color: colors.muted }}>undefined</span>;
  if (typeof value === "string")
    return <span style={{ color: colors.success }}>{JSON.stringify(value)}</span>;
  if (typeof value === "number")
    return <span style={{ color: colors.accent }}>{String(value)}</span>;
  if (typeof value === "boolean")
    return <span style={{ color: colors.warn }}>{String(value)}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: colors.muted }}>[]</span>;
    return (
      <span>
        <Header label={`[${value.length}]`} open={open} onToggle={() => setOpen((o) => !o)} />
        {open && (
          <div
            style={{
              paddingLeft: space.md,
              borderLeft: `1px solid ${colors.border}`,
              marginLeft: space.xs,
            }}
          >
            {value.map((v, i) => (
              <div key={i}>
                <span style={{ color: colors.muted }}>{i}: </span>
                <Node value={v} depth={depth + 1} expandDepth={expandDepth} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span style={{ color: colors.muted }}>{`{}`}</span>;
    return (
      <span>
        <Header label={`{${entries.length}}`} open={open} onToggle={() => setOpen((o) => !o)} />
        {open && (
          <div
            style={{
              paddingLeft: space.md,
              borderLeft: `1px solid ${colors.border}`,
              marginLeft: space.xs,
            }}
          >
            {entries.map(([k, v]) => (
              <div key={k}>
                <span style={{ color: colors.fg }}>{k}: </span>
                <Node value={v} depth={depth + 1} expandDepth={expandDepth} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span style={{ color: colors.fg }}>{String(value)}</span>;
}

function Header({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  return (
    <span onClick={onToggle} style={{ cursor: "pointer", color: colors.muted, userSelect: "none" }}>
      <Caret open={open} />
      {label}
    </span>
  );
}

function Caret({ open }: { open: boolean }) {
  const { colors } = useTheme();
  return (
    <svg
      width={8}
      height={8}
      viewBox="0 0 10 10"
      fill="none"
      stroke={colors.muted}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        marginRight: 4,
        transform: open ? "rotate(90deg)" : undefined,
        transition: "transform 100ms ease",
      }}
      aria-hidden
    >
      <path d="M3 2 L7 5 L3 8" />
    </svg>
  );
}
