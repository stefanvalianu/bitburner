import type { CSSProperties, ReactNode } from "react";
import { Panel } from "./Panel";
import { ScrollScope } from "./ScrollScope";

// Bitburner's tail-window titlebar height. The dashboard frame uses
// `position: fixed`, which escapes to the tail window's transformed
// containing block (titlebar included), so we anchor the top below it.
const TITLEBAR_HEIGHT = 32;

interface DashboardPanelProps {
  title?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

// Full-tail-window frame for top-level dashboards: pins below the titlebar,
// fills the rest of the window, and re-enables themed scrollbars when the
// body overflows. Compose with sibling <Modal>s or fixed-position overlays
// (they render via portal / their own positioning context).
export function DashboardPanel({ title, children, style }: DashboardPanelProps) {
  return (
    <ScrollScope
      style={{
        position: "fixed",
        top: TITLEBAR_HEIGHT,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: "auto",
        display: "flex",
      }}
    >
      <Panel title={title} style={{ flex: 1, minWidth: 0, boxSizing: "border-box", ...style }}>
        {children}
      </Panel>
    </ScrollScope>
  );
}
