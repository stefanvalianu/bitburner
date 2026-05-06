import type { CSSProperties, ReactNode } from "react";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { Row } from "./Row";
import { useTheme } from "./theme";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

export function Modal({ open, onClose, title, children, style }: ModalProps) {
  const { space } = useTheme();
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh" }}>
        <Panel title={title} style={{ minWidth: 480, ...style }}>
          {children}
          <Row gap={space.sm} style={{ justifyContent: "flex-end" }}>
            <Button onClick={onClose}>Close</Button>
          </Row>
        </Panel>
      </div>
    </div>
  );
}
