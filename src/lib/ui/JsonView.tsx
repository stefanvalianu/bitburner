import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "./theme";

interface JsonViewProps {
  value: unknown;
  defaultExpandDepth?: number;
}

type Path = (string | number)[];

const ROOT_KEY = "$";

function encodePath(path: Path): string {
  let s = ROOT_KEY;
  for (const p of path) s += typeof p === "number" ? `[${p}]` : `.${p}`;
  return s;
}

interface OpenContextValue {
  isOpen: (key: string, depth: number) => boolean;
  toggle: (key: string, currentOpen: boolean) => void;
}

const OpenContext = createContext<OpenContextValue | null>(null);

interface SearchContextValue {
  query: string;
  activeKey: string | null;
  registerRow: (key: string, el: HTMLElement | null) => void;
}

const SearchContext = createContext<SearchContextValue>({
  query: "",
  activeKey: null,
  registerRow: () => {},
});

export function JsonView({ value, defaultExpandDepth = 1 }: JsonViewProps) {
  const { fonts, space } = useTheme();
  const [openMap, setOpenMap] = useState<Map<string, boolean>>(new Map());
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  const matches = useMemo(() => findMatches(value, query), [value, query]);
  const totalMatches = matches.length;
  const safeIdx = totalMatches === 0 ? -1 : Math.min(activeIdx, totalMatches - 1);
  const activePath = safeIdx >= 0 ? matches[safeIdx]! : null;
  const activeKey = activePath ? encodePath(activePath) : null;

  // Force-open every ancestor of the active match so it's reachable in the
  // collapsed tree without disturbing the user's other open/closed choices.
  const forcedOpen = useMemo(() => {
    const set = new Set<string>();
    if (!activePath) return set;
    for (let i = 0; i < activePath.length; i++) {
      set.add(encodePath(activePath.slice(0, i)));
    }
    return set;
  }, [activePath]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (!activeKey) return;
    const el = rowRefs.current.get(activeKey);
    if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeKey]);

  const isOpen = useCallback(
    (key: string, depth: number) => {
      if (forcedOpen.has(key)) return true;
      const explicit = openMap.get(key);
      if (explicit !== undefined) return explicit;
      return depth < defaultExpandDepth;
    },
    [forcedOpen, openMap, defaultExpandDepth],
  );

  const toggle = useCallback((key: string, currentOpen: boolean) => {
    setOpenMap((prev) => {
      const next = new Map(prev);
      next.set(key, !currentOpen);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const paths = collectContainerPaths(value);
    setOpenMap(new Map(paths.map((p) => [p, true])));
  }, [value]);

  const collapseAll = useCallback(() => {
    const paths = collectContainerPaths(value);
    setOpenMap(new Map(paths.map((p) => [p, false])));
  }, [value]);

  const next = useCallback(() => {
    if (totalMatches === 0) return;
    setActiveIdx((i) => (i + 1) % totalMatches);
  }, [totalMatches]);

  const prev = useCallback(() => {
    if (totalMatches === 0) return;
    setActiveIdx((i) => (i - 1 + totalMatches) % totalMatches);
  }, [totalMatches]);

  const registerRow = useCallback((key: string, el: HTMLElement | null) => {
    if (el) rowRefs.current.set(key, el);
    else rowRefs.current.delete(key);
  }, []);

  const openCtx = useMemo<OpenContextValue>(() => ({ isOpen, toggle }), [isOpen, toggle]);
  const searchCtx = useMemo<SearchContextValue>(
    () => ({ query, activeKey, registerRow }),
    [query, activeKey, registerRow],
  );

  return (
    <div style={{ fontFamily: fonts.mono, fontSize: 12, lineHeight: 1.5 }}>
      <ControlPanel
        query={query}
        onQueryChange={setQuery}
        matchIndex={safeIdx}
        totalMatches={totalMatches}
        onNext={next}
        onPrev={prev}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      />
      <div style={{ marginTop: space.sm }}>
        <OpenContext.Provider value={openCtx}>
          <SearchContext.Provider value={searchCtx}>
            <Node value={value} depth={0} path={[]} />
          </SearchContext.Provider>
        </OpenContext.Provider>
      </div>
    </div>
  );
}

function Node({ value, depth, path }: { value: unknown; depth: number; path: Path }) {
  const { colors, space } = useTheme();
  const open = useContext(OpenContext);
  const { query } = useContext(SearchContext);
  const key = encodePath(path);

  if (value === null) return <Highlighted text="null" color={colors.muted} query={query} />;
  if (value === undefined)
    return <Highlighted text="undefined" color={colors.muted} query={query} />;
  if (typeof value === "string")
    return <Highlighted text={JSON.stringify(value)} color={colors.success} query={query} />;
  if (typeof value === "number")
    return <Highlighted text={String(value)} color={colors.accent} query={query} />;
  if (typeof value === "boolean")
    return <Highlighted text={String(value)} color={colors.warn} query={query} />;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: colors.muted }}>[]</span>;
    const isExpanded = open!.isOpen(key, depth);
    return (
      <span>
        <Header
          label={`[${value.length}]`}
          open={isExpanded}
          onToggle={() => open!.toggle(key, isExpanded)}
        />
        {isExpanded && (
          <div
            style={{
              paddingLeft: space.md,
              borderLeft: `1px solid ${colors.border}`,
              marginLeft: space.xs,
            }}
          >
            {value.map((v, i) => (
              <ChildRow
                key={i}
                parentPath={path}
                itemKey={i}
                itemLabel={String(i)}
                child={v}
                depth={depth}
                keyColor={colors.muted}
              />
            ))}
          </div>
        )}
      </span>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span style={{ color: colors.muted }}>{`{}`}</span>;
    const isExpanded = open!.isOpen(key, depth);
    return (
      <span>
        <Header
          label={`{${entries.length}}`}
          open={isExpanded}
          onToggle={() => open!.toggle(key, isExpanded)}
        />
        {isExpanded && (
          <div
            style={{
              paddingLeft: space.md,
              borderLeft: `1px solid ${colors.border}`,
              marginLeft: space.xs,
            }}
          >
            {entries.map(([k, v]) => (
              <ChildRow
                key={k}
                parentPath={path}
                itemKey={k}
                itemLabel={k}
                child={v}
                depth={depth}
                keyColor={colors.fg}
              />
            ))}
          </div>
        )}
      </span>
    );
  }

  return <Highlighted text={String(value)} color={colors.fg} query={query} />;
}

function ChildRow({
  parentPath,
  itemKey,
  itemLabel,
  child,
  depth,
  keyColor,
}: {
  parentPath: Path;
  itemKey: string | number;
  itemLabel: string;
  child: unknown;
  depth: number;
  keyColor: string;
}) {
  const { colors, space } = useTheme();
  const { query, activeKey, registerRow } = useContext(SearchContext);
  const path = useMemo(() => [...parentPath, itemKey], [parentPath, itemKey]);
  const key = encodePath(path);
  const isActive = activeKey === key;
  const ref = useCallback((el: HTMLDivElement | null) => registerRow(key, el), [registerRow, key]);
  return (
    <div
      ref={ref}
      style={{
        background: isActive ? colors.well : undefined,
        outline: isActive ? `1px solid ${colors.accent}` : undefined,
        padding: isActive ? `0 ${space.xs}px` : undefined,
        margin: isActive ? `0 -${space.xs}px` : undefined,
      }}
    >
      <Highlighted text={itemLabel} color={keyColor} query={query} />
      <span style={{ color: keyColor }}>: </span>
      <Node value={child} depth={depth + 1} path={path} />
    </div>
  );
}

function Highlighted({ text, color, query }: { text: string; color: string; query: string }) {
  const { colors } = useTheme();
  if (!query) return <span style={{ color }}>{text}</span>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (!lower.includes(q)) return <span style={{ color }}>{text}</span>;
  const parts: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < text.length) {
    const at = lower.indexOf(q, i);
    if (at === -1) {
      parts.push(<span key={n++}>{text.slice(i)}</span>);
      break;
    }
    if (at > i) parts.push(<span key={n++}>{text.slice(i, at)}</span>);
    parts.push(
      <span
        key={n++}
        style={{
          background: colors.warn,
          color: colors.bg,
          fontWeight: 600,
          padding: "0 1px",
          borderRadius: 2,
        }}
      >
        {text.slice(at, at + q.length)}
      </span>,
    );
    i = at + q.length;
  }
  return <span style={{ color }}>{parts}</span>;
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

interface ControlPanelProps {
  query: string;
  onQueryChange: (q: string) => void;
  matchIndex: number;
  totalMatches: number;
  onNext: () => void;
  onPrev: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

function ControlPanel({
  query,
  onQueryChange,
  matchIndex,
  totalMatches,
  onNext,
  onPrev,
  onExpandAll,
  onCollapseAll,
}: ControlPanelProps) {
  const { colors, fonts, space } = useTheme();
  const noMatches = query !== "" && totalMatches === 0;
  const counter =
    query === "" ? "" : totalMatches === 0 ? "0 / 0" : `${matchIndex + 1} / ${totalMatches}`;
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        fontFamily: fonts.mono,
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        gap: space.xs,
        border: `1px solid ${colors.border}`,
        background: colors.surface,
        padding: `${space.xs}px ${space.sm}px`,
      }}
    >
      <IconButton title="Expand all" onClick={onExpandAll}>
        <PlusBoxIcon color={colors.muted} />
      </IconButton>
      <IconButton title="Collapse all" onClick={onCollapseAll}>
        <MinusBoxIcon color={colors.muted} />
      </IconButton>
      <span
        style={{
          width: 1,
          alignSelf: "stretch",
          background: colors.border,
          margin: `0 ${space.xs}px`,
        }}
      />
      <span style={{ color: colors.accent, userSelect: "none" }}>/</span>
      <input
        type="text"
        value={query}
        placeholder="search keys & values"
        spellCheck={false}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape" && query !== "") {
            e.preventDefault();
            // Stop the native event so the enclosing Modal's body listener
            // doesn't also see Escape and close the dialog.
            e.nativeEvent.stopPropagation();
            onQueryChange("");
          }
        }}
        style={{
          flex: 1,
          minWidth: 120,
          background: colors.bg,
          color: noMatches ? colors.error : colors.fg,
          border: `1px solid ${noMatches ? colors.error : colors.border}`,
          fontFamily: fonts.mono,
          fontSize: 12,
          padding: `${space.xs}px ${space.sm}px`,
          outline: "none",
        }}
      />
      <span
        style={{
          color: noMatches ? colors.error : colors.muted,
          minWidth: 56,
          textAlign: "right",
          userSelect: "none",
        }}
      >
        {counter}
      </span>
      <IconButton
        title="Previous match (Shift+Enter)"
        onClick={onPrev}
        disabled={totalMatches === 0}
      >
        <ChevronUpIcon color={colors.muted} />
      </IconButton>
      <IconButton title="Next match (Enter)" onClick={onNext} disabled={totalMatches === 0}>
        <ChevronDownIcon color={colors.muted} />
      </IconButton>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { colors, fonts, space } = useTheme();
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: fonts.mono,
        background: "transparent",
        color: colors.muted,
        border: `1px solid ${colors.border}`,
        padding: `${space.xs}px ${space.sm}px`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "inline-flex",
        alignItems: "center",
        lineHeight: 0,
      }}
    >
      {children}
    </button>
  );
}

function PlusBoxIcon({ color }: { color: string }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="2" width="12" height="12" rx="0.5" />
      <path d="M5 8 H11" />
      <path d="M8 5 V11" />
    </svg>
  );
}

function MinusBoxIcon({ color }: { color: string }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="2" width="12" height="12" rx="0.5" />
      <path d="M5 8 H11" />
    </svg>
  );
}

function ChevronUpIcon({ color }: { color: string }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 7 L5 3 L8 7" />
    </svg>
  );
}

function ChevronDownIcon({ color }: { color: string }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 3 L5 7 L8 3" />
    </svg>
  );
}

function findMatches(value: unknown, query: string): Path[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const out: Path[] = [];
  function walk(v: unknown, path: Path) {
    if (v === null) {
      if ("null".includes(q)) out.push(path);
      return;
    }
    if (v === undefined) {
      if ("undefined".includes(q)) out.push(path);
      return;
    }
    if (typeof v === "string") {
      if (JSON.stringify(v).toLowerCase().includes(q)) out.push(path);
      return;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      if (String(v).toLowerCase().includes(q)) out.push(path);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((c, i) => walk(c, [...path, i]));
      return;
    }
    if (typeof v === "object") {
      for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
        const childPath = [...path, k];
        if (k.toLowerCase().includes(q)) out.push(childPath);
        walk(c, childPath);
      }
    }
  }
  walk(value, []);
  return out;
}

function collectContainerPaths(value: unknown): string[] {
  const out: string[] = [];
  function walk(v: unknown, path: Path) {
    if (Array.isArray(v)) {
      if (v.length === 0) return;
      out.push(encodePath(path));
      v.forEach((c, i) => walk(c, [...path, i]));
      return;
    }
    if (v !== null && typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) return;
      out.push(encodePath(path));
      for (const [k, c] of entries) walk(c, [...path, k]);
    }
  }
  walk(value, []);
  return out;
}
