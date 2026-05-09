import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { Row } from "./Row";
import { ScrollScope } from "./ScrollScope";
import { useTheme } from "./theme";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  actions?: ReactNode;
}

export function Modal({ open, onClose, title, children, style, actions }: ModalProps) {
  const { space } = useTheme();
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  // Reach the document body via a mounted sentinel's `ownerDocument` rather
  // than naming the `document` global directly — the latter trips Bitburner's
  // static RAM analyzer for an extra 25GB charge per script.
  useEffect(() => {
    const owner = sentinelRef.current?.ownerDocument;
    if (owner) setBody(owner.body);
  }, []);

  useEffect(() => {
    if (!open || !body) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    body.addEventListener("keydown", onKey);
    return () => body.removeEventListener("keydown", onKey);
  }, [open, body, onClose]);

  return (
    <>
      <span ref={sentinelRef} style={{ display: "none" }} />
      {open && body
        ? createPortal(
            <ScrollScope
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
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "90vw",
                  maxHeight: "90vh",
                  overflow: "auto",
                }}
              >
                <Panel title={title} style={{ minWidth: 480, ...style }}>
                  {children}
                  <Row gap={space.sm} style={{ justifyContent: "flex-end" }}>
                    {actions}
                    <Button onClick={onClose}>Close</Button>
                  </Row>
                </Panel>
              </div>
            </ScrollScope>,
            body,
          )
        : null}
    </>
  );
}
